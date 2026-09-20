import prisma from "../config/prisma.js";

const DAY_MS = 86400000;
const RANGES = [7, 30, 90];
const LOW_STOCK_THRESHOLD = 10;

// Order status is free text in this schema, so cancelled/returned are matched case-insensitively.
const NOT_COUNTED = ["cancelled", "canceled", "failed"];

const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const num = (v) => Number(v || 0);

async function periodStats(from, to) {
  const [row] = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM(total) FILTER (WHERE lower(status) <> ALL(${NOT_COUNTED})), 0)::float AS revenue,
      COUNT(*) FILTER (WHERE lower(status) <> ALL(${NOT_COUNTED}))::int AS orders,
      COUNT(*) FILTER (WHERE lower(status) = ANY(${NOT_COUNTED}))::int AS cancelled,
      COUNT(*)::int AS placed
    FROM orders
    WHERE COALESCE(is_deleted, false) = false AND created_at >= ${from}::timestamp AND created_at < ${to}::timestamp`;
  const [cust] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS n FROM users WHERE role = 'USER' AND created_at >= ${from}::timestamp AND created_at < ${to}::timestamp`;
  return { ...row, new_customers: cust.n, aov: row.orders > 0 ? row.revenue / row.orders : 0 };
}

// GET /api/admin/dashboard?days=7|30|90
export const getDashboard = async (req, res) => {
  try {
    const days = RANGES.includes(parseInt(req.query.days)) ? parseInt(req.query.days) : 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    const prevFrom = new Date(from.getTime() - days * DAY_MS);
    const iso = (d) => d.toISOString();

    const [cur, prev, trend, statusMix, paymentMix, topProducts, topCategories, recent, queues, stockRows] = await Promise.all([
      periodStats(iso(from), iso(to)),
      periodStats(iso(prevFrom), iso(from)),
      prisma.$queryRaw`
        SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(o.total) FILTER (WHERE lower(o.status) <> ALL(${NOT_COUNTED})), 0)::float AS revenue,
               COUNT(o.id) FILTER (WHERE lower(o.status) <> ALL(${NOT_COUNTED}))::int AS orders
        FROM generate_series(${iso(from)}::timestamp::date, ${iso(to)}::timestamp::date, interval '1 day') d
        LEFT JOIN orders o ON o.created_at::date = d::date AND COALESCE(o.is_deleted, false) = false
        GROUP BY d ORDER BY d`,
      prisma.$queryRaw`
        SELECT lower(COALESCE(status, 'unknown')) AS status, COUNT(*)::int AS n
        FROM orders WHERE COALESCE(is_deleted, false) = false AND created_at >= ${iso(from)}::timestamp AND created_at < ${iso(to)}::timestamp
        GROUP BY 1 ORDER BY n DESC`,
      prisma.$queryRaw`
        SELECT lower(COALESCE(payment_method, 'unknown')) AS method, COUNT(*)::int AS n, COALESCE(SUM(total), 0)::float AS total
        FROM orders WHERE COALESCE(is_deleted, false) = false AND lower(status) <> ALL(${NOT_COUNTED})
          AND created_at >= ${iso(from)}::timestamp AND created_at < ${iso(to)}::timestamp
        GROUP BY 1 ORDER BY n DESC`,
      prisma.$queryRaw`
        SELECT p.id, p.name, SUM(oi.quantity)::int AS units, SUM(oi.quantity * oi.price)::float AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN product_variants v ON v.id = oi.variant_id
        JOIN products p ON p.id = v.product_id
        WHERE COALESCE(o.is_deleted, false) = false AND lower(o.status) <> ALL(${NOT_COUNTED})
          AND o.created_at >= ${iso(from)}::timestamp AND o.created_at < ${iso(to)}::timestamp
        GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 5`,
      prisma.$queryRaw`
        SELECT c.id, c.name, SUM(oi.quantity * oi.price)::float AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN product_variants v ON v.id = oi.variant_id
        JOIN products p ON p.id = v.product_id
        JOIN categories c ON c.id = p.category_id
        WHERE COALESCE(o.is_deleted, false) = false AND lower(o.status) <> ALL(${NOT_COUNTED})
          AND o.created_at >= ${iso(from)}::timestamp AND o.created_at < ${iso(to)}::timestamp
        GROUP BY c.id, c.name ORDER BY revenue DESC LIMIT 6`,
      prisma.orders.findMany({
        // `not: true` would also drop NULL, which this column allows.
        where: { OR: [{ is_deleted: false }, { is_deleted: null }] },
        orderBy: { created_at: "desc" },
        take: 8,
        select: { id: true, invoice_number: true, receiver_name: true, total: true, status: true, payment_method: true, created_at: true, users: { select: { name: true, email: true } } },
      }),
      Promise.all([
        prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM orders WHERE COALESCE(is_deleted,false) = false AND lower(status) = 'pending'`,
        prisma.return_orders.count({ where: { status: { equals: "pending", mode: "insensitive" } } }),
        prisma.cod_collections.count({ where: { status: "DEPOSIT_CLAIMED" } }),
        prisma.seller_products.count({ where: { status: "PENDING_APPROVAL" } }),
        Promise.all([prisma.rider_documents.count({ where: { status: "PENDING" } }), prisma.seller_documents.count({ where: { status: "PENDING" } })]),
        prisma.product_enquiries.count({ where: { status: "OPEN" } }),
        prisma.contact_queries.count({ where: { status: { equals: "pending", mode: "insensitive" } } }),
        prisma.referral_withdrawals.count({ where: { status: "PENDING" } }),
        prisma.affiliate_payouts.count({ where: { status: "PENDING" } }),
        prisma.referral_fraud_logs.count({ where: { status: "PENDING_REVIEW" } }),
      ]),
      prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM product_variants v JOIN inventory i ON i.variant_id = v.id
                                             WHERE v.product_id = p.id AND i.stock_qty > i.reserved_qty))::int AS out_of_stock,
          COUNT(*) FILTER (WHERE (SELECT COALESCE(SUM(GREATEST(i.stock_qty - i.reserved_qty, 0)), 0)
                                  FROM product_variants v JOIN inventory i ON i.variant_id = v.id
                                  WHERE v.product_id = p.id) BETWEEN 1 AND ${LOW_STOCK_THRESHOLD})::int AS low_stock,
          COUNT(*) FILTER (WHERE p.active IS NOT FALSE)::int AS active_products
        FROM products p WHERE p.active IS NOT FALSE`,
    ]);

    const [pendingOrders, pendingReturns, codReview, sellerProducts, [riderDocs, sellerDocs], openEnquiries, pendingContacts, refWithdrawals, affPayouts, fraudOpen] = queues;
    const stock = stockRows[0];
    const [{ n: pendingOrdersN }] = pendingOrders;

    // Work queue: everything that is waiting on an admin, ordered by how directly it blocks customers or money.
    const attention = [
      { key: "orders", label: "Orders awaiting action", count: pendingOrdersN, path: "/AdminOrders", group: "Orders" },
      { key: "returns", label: "Return requests", count: pendingReturns, path: "/return-orders", group: "Orders" },
      { key: "cod", label: "COD deposits to review", count: codReview, path: "/cod-collections", group: "Finance" },
      { key: "seller_products", label: "Seller products to approve", count: sellerProducts, path: "/warehouses/seller-requests", group: "Catalogue" },
      { key: "documents", label: "Documents to verify", count: riderDocs + sellerDocs, path: "/document-verification", group: "People" },
      { key: "out_of_stock", label: "Active products out of stock", count: stock.out_of_stock, path: "/products?stock=out_of_stock&active=true", group: "Catalogue" },
      { key: "ref_withdrawals", label: "Referral withdrawals", count: refWithdrawals, path: "/referral/withdrawals", group: "Growth" },
      { key: "aff_payouts", label: "Affiliate payouts", count: affPayouts, path: "/affiliate/payouts", group: "Growth" },
      { key: "fraud", label: "Fraud cases to review", count: fraudOpen, path: "/fraud-risk", group: "Growth" },
      { key: "enquiries", label: "Open product enquiries", count: openEnquiries, path: "/product-enquiries", group: "Support" },
      { key: "contacts", label: "Contact queries", count: pendingContacts, path: "/contact-queries", group: "Support" },
    ];

    res.json({
      success: true,
      range: { days, from, to },
      kpis: {
        revenue: { value: cur.revenue, change: pct(cur.revenue, prev.revenue) },
        orders: { value: cur.orders, change: pct(cur.orders, prev.orders) },
        aov: { value: cur.aov, change: pct(cur.aov, prev.aov) },
        new_customers: { value: cur.new_customers, change: pct(cur.new_customers, prev.new_customers) },
        cancel_rate: { value: cur.placed > 0 ? Math.round((cur.cancelled / cur.placed) * 1000) / 10 : null, cancelled: cur.cancelled, placed: cur.placed },
      },
      trend: trend.map((t) => ({ day: t.day, revenue: num(t.revenue), orders: num(t.orders) })),
      status_mix: statusMix,
      payment_mix: paymentMix,
      top_products: topProducts,
      top_categories: topCategories,
      recent_orders: recent.map((o) => ({ id: o.id, number: o.invoice_number, customer: o.receiver_name || o.users?.name || o.users?.email || "Guest", total: num(o.total), status: o.status, payment_method: o.payment_method, created_at: o.created_at })),
      attention,
      catalogue: { active_products: stock.active_products, out_of_stock: stock.out_of_stock, low_stock: stock.low_stock, low_stock_threshold: LOW_STOCK_THRESHOLD },
    });
  } catch (err) {
    console.error("Error in getDashboard:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
