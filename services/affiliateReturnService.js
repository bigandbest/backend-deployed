import prisma from "../config/prisma.js";

const money = value => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;

// Use the conversion snapshot, never today's rates. Legacy conversions without item IDs
// receive the same proportional reduction across their original product value.
export const calculateAffiliateReturnAdjustment = (order, returns, items) => {
  const quantities = new Map();
  let unallocatedRefund = 0;
  for (const entry of returns) {
    if (!entry.return_order_items?.length) unallocatedRefund += Number(entry.refund_amount || 0);
    for (const line of entry.return_order_items || []) quantities.set(line.order_item_id, (quantities.get(line.order_item_id) || 0) + Number(line.quantity || 0));
  }
  const returned = items.map(item => ({ ...item, returned: Math.min(Number(item.quantity), Math.max(0, quantities.get(item.id) || 0)) }));
  const gross = Number(order.gross_order_value || 0);
  const base = Number(order.net_order_value || 0);
  const originalCommission = Number(order.commission_amount || 0);
  const refund = money(Math.min(gross, unallocatedRefund + returned.reduce((sum, item) => sum + Number(item.price) * item.returned, 0)));
  const ratio = gross > 0 ? Math.min(1, refund / gross) : 0;
  const snapshot = order.campaign_breakdown;
  const itemSnapshots = Array.isArray(snapshot) && snapshot.length === items.length && snapshot.every(line => line.order_item_id && items.some(item => item.id === line.order_item_id));
  let reduction = originalCommission * ratio;
  if (itemSnapshots && unallocatedRefund === 0) {
    reduction = snapshot.reduce((sum, line) => {
      const item = returned.find(item => item.id === line.order_item_id);
      return sum + Number(line.commission) * (item.quantity > 0 ? item.returned / item.quantity : 0);
    }, 0);
  }
  return { returnAmount: refund, finalOrderValue: money(base * (1 - ratio)), finalCommission: money(originalCommission - reduction) };
};

export const reconcileAffiliateReturns = async (orderId, { full = false } = {}) => prisma.$transaction(async tx => {
  // Serializes return replays with conversion approval and full cancellation.
  await tx.$queryRaw`SELECT id FROM affiliate_orders WHERE order_id = ${orderId}::uuid FOR UPDATE`;
  const order = await tx.affiliate_orders.findUnique({ where: { order_id: orderId } });
  if (!order || order.is_returned || order.commission_status === "REVERSED") return null;
  const returns = await tx.return_orders.findMany({ where: { order_id: orderId, status: "completed", return_type: { not: "cancellation" } }, include: { return_order_items: true } });
  if (!returns.length && !full) return order;
  const items = await tx.order_items.findMany({ where: { order_id: orderId } });
  const next = full ? { returnAmount: Number(order.gross_order_value), finalOrderValue: 0, finalCommission: 0 } : calculateAffiliateReturnAdjustment(order, returns, items);
  // Completed return rows are durable input; repeated callbacks never add the refund twice.
  if (Number(order.return_amount) === next.returnAmount && Number(order.final_commission) === next.finalCommission) return order;
  if (next.returnAmount < Number(order.return_amount)) return order;
  const grossReduction = money(Number(order.final_commission) - next.finalCommission);
  if (order.commission_status === "PENDING") {
    await tx.affiliate_profiles.update({ where: { id: order.affiliate_id }, data: { pending_balance: { decrement: grossReduction }, total_commission_earned: { decrement: grossReduction } } });
  } else {
    await tx.$queryRaw`SELECT id FROM affiliate_commissions WHERE affiliate_order_id = ${order.id}::uuid FOR UPDATE`;
    const commission = await tx.affiliate_commissions.findUnique({ where: { affiliate_order_id: order.id } });
    // Completed or processing external payments cannot safely be changed after dispatch.
    // Persist an audit record once per cumulative return amount, without creating customer debt.
    let payout = null;
    if (commission?.payout_id) {
      await tx.$queryRaw`SELECT id FROM affiliate_payouts WHERE id = ${commission.payout_id}::uuid FOR UPDATE`;
      payout = await tx.affiliate_payouts.findUnique({ where: { id: commission.payout_id } });
    }
    if (!commission || commission.status === "PAID" || (payout && payout.status !== "PENDING")) {
      if (Number(order.return_amount) !== next.returnAmount) await tx.referral_admin_logs.create({ data: {
        admin_name: "SYSTEM", action: full ? "AFFILIATE_COMMISSION_LOSS_ABSORBED" : "AFFILIATE_PARTIAL_RETURN_LOSS_ABSORBED", entity_type: "affiliate_order", entity_id: order.id,
        action_description: `Completed return on order ${orderId}; external payout retained without clawback`,
        previous_value: { return_amount: Number(order.return_amount) }, new_value: { return_amount: next.returnAmount, commission_reduction: grossReduction },
      } });
      return tx.affiliate_orders.update({ where: { id: order.id }, data: { return_amount: next.returnAmount, ...(full ? { is_returned: true } : {}) } });
    }
    const tds = money(next.finalCommission * Number(commission.tds_rate || 0) / 100);
    const net = money(next.finalCommission - tds);
    const netReduction = money(Number(commission.final_amount) - net);
    await tx.affiliate_commissions.update({ where: { id: commission.id }, data: { order_value: next.finalOrderValue, gross_commission: next.finalCommission, net_commission: net, final_amount: net, tds_amount: tds, ...(full ? { status: "CANCELLED", payout_id: null, cancelled_at: new Date(), cancellation_reason: "Order returned/cancelled" } : {}) } });
    if (payout) await tx.affiliate_payouts.update({ where: { id: payout.id }, data: { gross_amount: { decrement: grossReduction }, net_amount: { decrement: netReduction }, tds_amount: { decrement: money(Number(commission.tds_amount) - tds) }, ...(full ? { commission_count: { decrement: 1 } } : {}) } });
    await tx.affiliate_profiles.update({ where: { id: order.affiliate_id }, data: { [payout ? "processing_balance" : "available_balance"]: { decrement: netReduction }, total_commission_earned: { decrement: grossReduction } } });
  }
  return tx.affiliate_orders.update({ where: { id: order.id }, data: { return_amount: next.returnAmount, final_order_value: next.finalOrderValue, final_commission: next.finalCommission, ...(full ? { is_returned: true, commission_status: "REVERSED" } : {}) } });
}, { maxWait: 10000, timeout: 30000 });

// Replays missed callbacks after crashes, including returns completed before attribution.
let returnCursor = null;
export const reconcileCompletedAffiliateReturns = async () => {
  const rows = await prisma.return_orders.findMany({
    where: { OR: [{ status: "completed" }, { return_type: "cancellation" }], ...(returnCursor ? { id: { gt: returnCursor } } : {}) },
    select: { id: true, order_id: true, return_type: true }, orderBy: { id: "asc" }, take: 100,
  });
  returnCursor = rows.length === 100 ? rows.at(-1).id : null;
  let failed = 0;
  const orderIds = [...new Set(rows.map(row => row.order_id))];
  for (const orderId of orderIds) {
    try { await reconcileAffiliateReturns(orderId, { full: rows.some(row => row.order_id === orderId && row.return_type === "cancellation") }); }
    catch (error) { failed++; console.error(`[affiliate-returns] ${orderId}:`, error.message); }
  }
  return { checked: orderIds.length, failed };
};
