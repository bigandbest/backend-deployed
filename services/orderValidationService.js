// Server-side re-validation of client-supplied order lines against the database.
// Order endpoints receive price / subtotal from the client (which may have read them from a cached product list, a
// local cart, or a tampered request); this checks them against live variant data before any stock is reserved or any
// wallet is charged. Stock is NOT checked here — reserveStock() already does that atomically.
import prisma from "../config/prisma.js";
import BulkPricingTiersDAO from "../dao/bulk-pricing-tiers.dao.js";
import couponValidator from "./couponValidator.js";

const PRICE_TOLERANCE = 0.01; // rupees
const SUBTOTAL_TOLERANCE = 1; // rupees, absorbs per-line rounding on the client

const toNumber = (v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * @param {object} args
 * @param {string} args.userId
 * @param {Array<{variantId: string, quantity: number, price: any}>} args.lines
 * @param {any} [args.clientSubtotal] compared with sum(price*qty) when provided
 * @param {boolean} [args.allowBulkTierPrice] also accept the bulk-tier unit price for the ordered quantity
 * @returns {Promise<{ok: true} | {ok: false, status: number, body: object}>}
 */
export async function validateOrderLines({ userId, lines, clientSubtotal, allowBulkTierPrice = false }) {
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter(Boolean))];
  if (variantIds.length === 0) return { ok: true, computedSubtotal: 0, priced: [] };

  const [variants, bidCartRows] = await Promise.all([
    prisma.product_variants.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, price: true, active: true, products: { select: { id: true, active: true, brands: { select: { brand_id: true } } } } },
    }),
    userId
      ? prisma.cart_items.findMany({
          where: { user_id: userId, variant_id: { in: variantIds }, is_bid_product: true },
          select: { variant_id: true, bid_unit_price: true },
        })
      : Promise.resolve([]),
  ]);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const bidPriceByVariant = new Map(
    bidCartRows.filter((r) => r.bid_unit_price != null).map((r) => [r.variant_id, Number(r.bid_unit_price)])
  );

  const unavailable = [];
  const priceChanges = [];
  let computedSubtotal = 0;
  const priced = [];

  for (const line of lines) {
    const clientPrice = toNumber(line.price);
    const variant = variantById.get(line.variantId);

    if (!variant || variant.active === false || !variant.products || variant.products.active === false) {
      unavailable.push({ variant_id: line.variantId, reason: "no_longer_available" });
      continue;
    }

    const bidPrice = bidPriceByVariant.get(line.variantId);
    const expected = bidPrice !== undefined ? bidPrice : Number(variant.price);
    let matches = Number.isFinite(clientPrice) && Math.abs(clientPrice - expected) <= PRICE_TOLERANCE;

    if (!matches && allowBulkTierPrice && Number.isFinite(clientPrice) && bidPrice === undefined) {
      try {
        const tier = await BulkPricingTiersDAO.getApplicableTier(line.variantId, line.quantity);
        if (tier) matches = Math.abs(clientPrice - Number(tier.unit_price)) <= PRICE_TOLERANCE;
      } catch {
        // tier lookup failure falls through to the mismatch below
      }
    }

    if (!matches) {
      priceChanges.push({ variant_id: line.variantId, submitted_price: line.price, current_price: expected });
      continue;
    }
    computedSubtotal += clientPrice * line.quantity;
    priced.push({
      variantId: line.variantId,
      productId: variant.products.id,
      quantity: line.quantity,
      price: clientPrice,
      brandIds: (variant.products.brands || []).map((b) => b.brand_id),
    });
  }

  if (unavailable.length > 0) {
    return {
      ok: false,
      status: 409,
      body: { success: false, error: "Some items are no longer available", unavailable },
    };
  }
  if (priceChanges.length > 0) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        code: "PRICE_CHANGED",
        error: "Prices have changed. Please review your cart and try again.",
        price_changes: priceChanges,
      },
    };
  }

  if (clientSubtotal !== undefined && clientSubtotal !== null) {
    const subtotal = toNumber(clientSubtotal);
    if (!Number.isFinite(subtotal) || Math.abs(subtotal - computedSubtotal) > SUBTOTAL_TOLERANCE) {
      return {
        ok: false,
        status: 409,
        body: {
          success: false,
          code: "PRICE_CHANGED",
          error: "Order subtotal does not match current prices. Please review your cart and try again.",
          expected_subtotal: Math.round(computedSubtotal * 100) / 100,
        },
      };
    }
  }

  return { ok: true, computedSubtotal, priced };
}

const TOTAL_TOLERANCE = 1; // rupees

/**
 * Server-side floor for the order total. Mirrors the client formula
 *   total = subtotal + handling + surge + platform + delivery − milestone discount − coupon − discount_charge
 * using live charge settings, delivery milestones and a re-validated coupon. Only UNDER-payment is rejected: the
 * client may hold slightly older charge settings, and charging more than the server figure is not an abuse vector.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {number} args.subtotal        server-verified sum(price*qty) from validateOrderLines
 * @param {Array}  args.priced          `priced` from validateOrderLines
 * @param {string} [args.couponCode]
 * @param {any}    args.clientTotal     amount the client says is payable
 * @returns {Promise<{ok: true, expectedTotal: number} | {ok: false, status: number, body: object}>}
 */
export async function validateOrderTotal({ userId, subtotal, priced, couponCode, clientTotal }) {
  const [settings, milestones] = await Promise.all([
    prisma.charge_settings.findUnique({ where: { id: 1 } }),
    prisma.delivery_charge_milestones.findMany({ orderBy: { min_order_value: "asc" } }),
  ]);
  const num = (v) => (v == null ? 0 : Number(v) || 0);

  // Same lookup the client does: first milestone whose limit is >= subtotal; none => free delivery; no milestones
  // configured at all => the fixed default charge (30, hard-coded in chargeSettingsController).
  let delivery = 30;
  let surcharge = 0;
  let milestoneDiscount = 0;
  if (milestones.length > 0) {
    const m = milestones.find((x) => subtotal <= Number(x.min_order_value));
    delivery = m ? num(m.delivery_charge) : 0;
    surcharge = m ? num(m.surcharge) : 0;
    milestoneDiscount = m ? num(m.discount) : 0;
  }

  let couponDiscount = 0;
  let couponId = null;
  if (couponCode) {
    try {
      const coupon = await couponValidator.checkExistence(couponCode);
      const now = new Date();
      if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_to)) throw new Error("Coupon has expired");
      await couponValidator.checkUserEligibility(coupon, userId);
      await couponValidator.checkUsageLimits(coupon, userId);
      const cartData = {
        subtotal,
        total: subtotal,
        items: priced.map((p) => ({
          price: p.price,
          quantity: p.quantity,
          brand_id: (Array.isArray(coupon.allowed_brands) ? coupon.allowed_brands : []).find((b) => p.brandIds.includes(b)),
        })),
      };
      await couponValidator.checkMinOrderValue(coupon, cartData);
      await couponValidator.checkBrandEligibility(coupon, cartData);
      couponDiscount = Number(await couponValidator.calculateDiscount(coupon, cartData)) || 0;
      couponId = coupon.id;
    } catch (err) {
      return {
        ok: false,
        status: 409,
        body: { success: false, code: "COUPON_INVALID", error: err.message || "Coupon is not valid" },
      };
    }
  }

  const expectedTotal = Math.max(
    0,
    subtotal + num(settings?.handling_charge) + surcharge + num(settings?.platform_charge) + delivery
      - milestoneDiscount - couponDiscount - num(settings?.discount_charge)
  );
  const total = toNumber(clientTotal);
  if (!Number.isFinite(total) || total < expectedTotal - TOTAL_TOLERANCE) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        code: "PRICE_CHANGED",
        error: "Order total does not match current charges. Please review your cart and try again.",
        expected_total: Math.round(expectedTotal * 100) / 100,
      },
    };
  }
  return {
    ok: true,
    expectedTotal,
    couponId,
    couponDiscount,
    subtotal,
    // Server-side figures for the stored order columns (instead of whatever the client sent).
    charges: {
      shipping: delivery,
      handling_charge: num(settings?.handling_charge),
      surge_charge: surcharge,
      platform_charge: num(settings?.platform_charge),
      discount_charge: num(settings?.discount_charge),
    },
  };
}

/**
 * Record the coupon as APPLIED for a just-created order so per-user / total usage limits see it (and cancelOrder can
 * release it). Never throws: the order already exists, so a bookkeeping failure must not fail the request.
 */
export async function recordCouponUsage({ totalCheck, userId, orderId }) {
  if (!totalCheck?.couponId || !orderId) return;
  try {
    await couponValidator.applyCoupon(
      totalCheck.couponId, userId, orderId, totalCheck.couponDiscount, totalCheck.subtotal, null
    );
  } catch (err) {
    console.error("Failed to record coupon usage for order", orderId, err.message);
  }
}

/**
 * For endpoints whose items may omit variant_id: fills it from the product's default (else oldest) variant.
 * Returns { lines } or { error } when a product has no variant.
 */
export async function resolveOrderLines(items) {
  const lines = [];
  for (const item of items) {
    const productId = String(item.product_id || item.id || "");
    let variantId = item.variant_id ? String(item.variant_id) : null;
    if (!variantId) {
      const v = productId
        ? await prisma.product_variants.findFirst({
            where: { product_id: productId },
            orderBy: [{ is_default: "desc" }, { created_at: "asc" }],
            select: { id: true },
          }).catch(() => null)
        : null;
      if (!v) return { error: `No variant found for product ${productId}` };
      variantId = v.id;
    }
    lines.push({ variantId, quantity: parseInt(item.quantity, 10) || 1, price: item.price });
  }
  return { lines };
}
