import Razorpay from "razorpay";
import crypto from "crypto";
/*
import {
  createOrderNotification,
  createAdminOrderNotification,
  createAdminCancelNotification,
} from "./NotificationHelpers.js";
*/
import orderDao from "../dao/order.dao.js";
import orderItemDao from "../dao/order-item.dao.js";
import productDao from "../dao/product.dao.js";
import BulkPricingTiersDAO from "../dao/bulk-pricing-tiers.dao.js";
import cartDao from "../dao/cart.dao.js";
import refundRequestDao from "../dao/refund-request.dao.js";
import userControlDao from "../dao/user.dao.js";
import chargeSettingDao from "../dao/charge-setting.dao.js";
import prisma from "../config/prisma.js";
import { createSubOrders } from "../services/subOrderService.js";
import { buildAddressString } from '../utils/geocode.js';
import walletDao from "../dao/wallet.dao.js";
import { findWarehouseForProducts, resolveSubOrderItems } from "../services/allocationEngine.js";
import cache from "../utils/cache.js";
import { publishJob } from "../utils/publishJob.js";
import { generateInvoiceIdentity } from "../utils/invoiceIdentity.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const validateOrderDeliverability = async (items, pincode) => {
  const normalizedPincode = String(pincode || "").trim();

  if (!normalizedPincode || !/^\d{6}$/.test(normalizedPincode)) {
    return {
      success: false,
      error: "A valid 6-digit delivery pincode is required",
      status: 400,
    };
  }

  const mappedItems = (items || [])
    .map((item) => ({
      productId: item.product_id || item.id || item.product?.id,
      variantId: item.variant_id || item.variantId || null,
      productType: item.product_type || null,
      quantity: parseInt(item.quantity, 10) || 1,
    }))
    .filter((item) => item.productId);

  if (mappedItems.length === 0) {
    return { success: true, pincode: normalizedPincode };
  }

  const { failures } = await findWarehouseForProducts(mappedItems, normalizedPincode);

  if (failures.length > 0) {
    return {
      success: false,
      error: "Some items are not deliverable to this pincode",
      status: 400,
      unavailable_products: failures.map((f) => ({ product_id: f.productId, reason: f.reason })),
    };
  }

  return { success: true, pincode: normalizedPincode };
};

const resolveOrderItemVariantId = async (item, productId) => {
  if (item.variant_id || item.variantId || item.variant?.id) {
    return item.variant_id || item.variantId || item.variant?.id;
  }

  const product = await productDao.getProductById(productId);
  return product?.variants?.find((v) => v.is_default)?.id || product?.variants?.[0]?.id || null;
};


/** Get all orders (admin usage) */
export const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, payment_method = "prepaid" } = req.query;

    const { items, total } = await orderDao.listAll(
      {
        ...(payment_method !== "all" && { payment_method })
      },
      {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    );

    return res.json({
      success: true,
      orders: items,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/** Update an order’s status */
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminnotes = "" } = req.body;

    // Get order details first to get user_id
    const order = await orderDao.getById(id);

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Only update status as adminnotes is not in schema
    await orderDao.update(id, { status });

    // Create notification for status update
    // await createOrderNotification(order.user_id, id, status, adminnotes);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/** Get orders for a specific user */
export const getUserOrders = async (req, res) => {
  try {
    const { user_id } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const page = Math.floor(offset / limit) + 1;

    console.log(
      "Getting orders for user_id:",
      user_id,
      "limit:",
      limit,
      "page:",
      page
    );

    const orders = await orderDao.listByUser(user_id, {
      page,
      limit
    });

    console.log("Sending response with orders count:", orders?.length || 0);
    return res.json({ success: true, orders });
  } catch (error) {
    console.error("Unexpected error in getUserOrders:", error);
    return res
      .status(500)
      .json({ success: false, error: error.message || "Internal server error" });
  }
};

/** Get orders for authenticated user (using middleware) */
export const getMyOrders = async (req, res) => {
  try {
    const { user } = req;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const page = Math.floor(offset / limit) + 1;

    console.log(
      "Getting orders for authenticated user:",
      user.id,
      "limit:",
      limit,
      "page:",
      page
    );

    const orders = await orderDao.listByUser(user.id, {
      page,
      limit
    });

    console.log("Sending response with orders count:", orders?.length || 0);
    return res.json({ success: true, orders: orders || [] });
  } catch (error) {
    console.error("Unexpected error in getMyOrders:", error);
    return res
      .status(500)
      .json({ success: false, error: error.message || "Internal server error" });
  }
};

/** Get complete order details by ID for authenticated user */
export const getOrderDetails = async (req, res) => {
  try {
    const { user } = req;
    const { orderId } = req.params;

    if (!user || !user.id) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!orderId) {
      return res.status(400).json({ success: false, error: "Order ID required" });
    }

    // Fetch complete order details
    const order = await orderDao.getById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Security check: ensure order belongs to user
    if (order.user_id !== user.id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }

    // Build tracking timeline
    const timeline = [];

    if (order.created_at) {
      timeline.push({
        key: "placed",
        title: "Order Placed",
        timestamp: order.created_at,
        completed: true
      });
    }

    const status = order.status || "pending";

    if (["confirmed", "shipped", "delivered"].includes(status)) {
      timeline.push({
        key: "confirmed",
        title: "Order Confirmed",
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }

    if (["shipped", "delivered"].includes(status)) {
      timeline.push({
        key: "shipped",
        title: "Shipped",
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }

    if (status === "delivered") {
      timeline.push({
        key: "delivered",
        title: "Delivered",
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }

    if (status === "cancelled") {
      timeline.push({
        key: "cancelled",
        title: "Cancelled",
        timestamp: order.updated_at || order.created_at,
        completed: true
      });
    }

    // Add pending steps
    if (!["delivered", "cancelled"].includes(status)) {
      if (!["confirmed", "shipped", "delivered"].includes(status)) {
        timeline.push({ key: "confirmed", title: "Order Confirmed", completed: false });
      }
      if (!["shipped", "delivered"].includes(status)) {
        timeline.push({ key: "shipped", title: "Shipped", completed: false });
      }
      timeline.push({ key: "delivered", title: "Delivered", completed: false });
    }

    // Fetch assigned rider info if order has a rider
    let riderInfo = null;
    if (order.rider_id) {
      const riderRecord = await prisma.riders.findUnique({
        where: { id: order.rider_id },
        select: {
          vehicle_type: true,
          users: { select: { name: true, phone: true } },
        },
      });
      if (riderRecord) {
        riderInfo = {
          name: riderRecord.users?.name || null,
          phone: riderRecord.users?.phone || null,
          vehicle_type: riderRecord.vehicle_type || null,
        };
      }
    }

    return res.json({
      success: true,
      order: {
        ...order,
        timeline,
        rider: riderInfo,
      }
    });
  } catch (error) {
    console.error("Unexpected error in getOrderDetails:", error);
    return res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
};

/** Place order with a flat address string */
export const placeOrder = async (req, res) => {
  try {
    const {
      user_id,
      items,
      subtotal,
      shipping,
      total,
      address,
      payment_method,
      handling_charge,
      surge_charge,
      platform_charge,
      discount_charge,
      coupon_code,
      coupon_discount,
      pincode: bodyPincode,
      mobile,
      receiver_name,
      delivery_latitude: bodyLat,
      delivery_longitude: bodyLon,
    } = req.body;

    const userRecord = user_id ? await userControlDao.getUserById(user_id) : null;
    const resolvedReceiverName =
      (receiver_name || userRecord?.name || "").toString().trim();
    const rawMobile = (mobile || userRecord?.phone || "").toString().replace(/\D/g, "");
    // Strip leading country code: 914444444444 → 4444444444, 914444444444 → 4444444444
    const resolvedMobile = rawMobile.length === 12 && rawMobile.startsWith("91")
      ? rawMobile.slice(2)
      : rawMobile.length === 13 && rawMobile.startsWith("091")
        ? rawMobile.slice(3)
        : rawMobile;

    if (!resolvedReceiverName || resolvedReceiverName.length < 2 || resolvedMobile.length !== 10) {
      return res.status(400).json({
        success: false,
        error: "Please complete profile with valid name and mobile number before placing order",
      });
    }

    // Use charges from request (snapshot) or fetch current settings as fallback
    let finalChargeSettings = {
      handling_charge: handling_charge !== undefined ? parseFloat(handling_charge) : 0,
      surge_charge: surge_charge !== undefined ? parseFloat(surge_charge) : 0,
      platform_charge: platform_charge !== undefined ? parseFloat(platform_charge) : 0,
      discount_charge: discount_charge !== undefined ? parseFloat(discount_charge) : 0
    };

    if (handling_charge === undefined) {
      try {
        const settings = await chargeSettingDao.get();
        if (settings) {
          finalChargeSettings = {
            handling_charge: parseFloat(settings.handling_charge || 0),
            surge_charge: parseFloat(settings.surge_charge || 0),
            platform_charge: parseFloat(settings.platform_charge || 0),
            discount_charge: parseFloat(settings.discount_charge || 0)
          };
        }
      } catch (err) {
        console.error("Error fetching charge settings for order:", err);
      }
    }

    // Prefer explicit pincode field; fall back to parsing from the address string
    let pincode = String(bodyPincode || "").trim();
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      const addressParts = (address || "").split(",");
      // Try each part right-to-left until we find a 6-digit value
      for (let i = addressParts.length - 1; i >= 0; i--) {
        const part = addressParts[i].trim();
        if (/^\d{6}$/.test(part)) { pincode = part; break; }
      }
    }

    // ✅ OPTIMIZATION: Skip full availability check (already validated in cart)
    // Just validate pincode for warehouse assignment
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: "Valid pincode is required for order placement",
      });
    }
    const deliverabilityValidation = { success: true, pincode };

    // COD limit: orders above ₹5,000 cannot use Cash on Delivery
    if (payment_method === "COD" && parseFloat(total) > 5000) {
      return res.status(400).json({
        success: false,
        error: "Cash on Delivery is only available for orders up to ₹5,000.",
      });
    }

    // Resolve variant IDs first (needed for parallel warehouse lookup)
    const itemsWithVariants = [];
    for (const item of items) {
      const productId = item.product_id || item.id || item.product?.id;
      if (!productId) {
        return res.status(400).json({ success: false, error: 'Order item is missing product_id' });
      }
      const quantity = parseInt(item.quantity, 10) || 1;
      const variantId = item.variant_id || (await resolveOrderItemVariantId(item, productId));
      if (!variantId) {
        return res.status(400).json({ success: false, error: `No variant found for product ${productId}` });
      }
      itemsWithVariants.push({ item, productId, quantity, variantId });
    }

    // Parallel warehouse lookup — replaces the sequential per-item loop
    const { successes: warehouseResults, failures: warehouseFailures } =
      await findWarehouseForProducts(
        itemsWithVariants.map(({ productId, variantId, quantity, item }) => ({
          productId,
          variantId,
          quantity,
          productType: item.product_type,
        })),
        deliverabilityValidation.pincode
      );

    if (warehouseFailures.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Some items are not deliverable to this pincode',
        unavailable_products: warehouseFailures.map(f => ({
          product_id: f.productId,
          reason: f.reason,
        })),
      });
    }

    const preparedItems = itemsWithVariants.map(({ item, productId, quantity, variantId }, idx) => ({
      item,
      productId,
      quantity,
      variantId,
      warehouseInfo: warehouseResults[idx].warehouseInfo,
    }));

    // ✅ Generate single OTP for all sub-orders (zonal, division, etc.)
    const deliveryOtp = Math.floor(100000 + Math.random() * 900000).toString();

    const identity = await prisma.$transaction(async (tx) => generateInvoiceIdentity(tx, "QK"));

    const order = await orderDao.create({
      user_id,
      subtotal: parseFloat(subtotal),
      shipping: parseFloat(shipping),
      total: parseFloat(total),
      address,
      delivery_pincode: deliverabilityValidation.pincode,
      payment_method,
      status: "pending",
      coupon_code: coupon_code || null,
      coupon_discount: coupon_discount ? parseFloat(coupon_discount) : 0,
      mobile: resolvedMobile,
      receiver_name: resolvedReceiverName,
      delivery_otp: deliveryOtp, // ✅ Save OTP at parent order level
      invoice_number: identity.invoice_number,
      irn: identity.irn,
      orn: identity.orn,
      invoice_generated_at: identity.invoice_generated_at,
      // Save GPS coordinates directly if provided by client (mobile app)
      ...(bodyLat != null && bodyLon != null ? {
        delivery_latitude: parseFloat(bodyLat),
        delivery_longitude: parseFloat(bodyLon),
      } : {}),
      ...finalChargeSettings
    });

    // Process order items with warehouse assignment
    const orderItemsToInsert = [];

    for (const { item, quantity, variantId, warehouseInfo } of preparedItems) {
      orderItemsToInsert.push({
        order_id: order.id,
        variant_id: variantId,
        quantity: quantity,
        price: parseFloat(item.price) || 0,
        assigned_warehouse_id: warehouseInfo?.warehouse_id || null,
        warehouse_name: warehouseInfo?.warehouse_name || null,
      });

      if (warehouseInfo?.seller_id) {
        await orderDao.update(order.id, { seller_id: warehouseInfo.seller_id });
      }
    }

    if (orderItemsToInsert.length > 0) {
      await orderItemDao.createMany(orderItemsToInsert);
    }

    // Warehouse assignments are already stored in order_items.assigned_warehouse_id

    // Clear user's cart
    await cartDao.clearCart(user_id);

    // ── Create sub-orders grouped by fulfillment source ──────────────────────
    // Stage 2 (fulfillment consolidation): routed through the shared
    // subOrderService.createSubOrders() instead of inline creation.
    // Stage 3: resolveSubOrderItems() now correctly propagates 'seller' as
    // source_type instead of silently relabeling it to 'division' — this is
    // what makes seller notification/accept/timeout/reroute actually fire
    // for orders placed through this endpoint.
    try {
      const warehouseIds = [...new Set(
        preparedItems.map(p => p.warehouseInfo?.warehouse_id).filter(Boolean)
      )];
      const warehouses = await prisma.warehouses.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, type: true },
      });
      const warehouseTypeMap = Object.fromEntries(warehouses.map(w => [w.id, w.type]));

      const normalizedItems = preparedItems.map(({ productId, quantity, variantId, item, warehouseInfo }) => ({
        productId, variantId, quantity, price: parseFloat(item.price) || 0, warehouseInfo,
      }));
      const resolvedItems = resolveSubOrderItems(normalizedItems, warehouseTypeMap);

      await createSubOrders(order.id, resolvedItems);
    } catch (subOrderErr) {
      console.error('Sub-order creation error:', subOrderErr.message, subOrderErr.stack);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Respond to the user immediately — all async work is queued below
    const response = res.json({
      success: true,
      order,
      message: 'Order placed successfully.',
    });

    // Enqueue geocoding (only if GPS not provided directly by client)
    if (bodyLat == null || bodyLon == null) {
      const addressString = buildAddressString({
        addressLine1: address,
        city: '',
        state: '',
        pincode: deliverabilityValidation.pincode,
      });
      await publishJob('geocode_order', {
        orderId: order.id,
        addressString,
      });
    }

    // Enqueue fulfillment routing
    await publishJob('fulfillment_routing', { orderId: order.id });

    return response;
  } catch (error) {
    console.error("Error in placeOrder:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const placeOrderWithDetailedAddress = async (req, res) => {
  try {
    const {
      user_id,
      items,
      subtotal,
      shipping,
      total,
      detailedAddress,
      payment_method,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      handling_charge,
      surge_charge,
      platform_charge,
      discount_charge,
      coupon_code,
      coupon_discount,
      mobile,
      receiver_name
    } = req.body;

    const userRecord = user_id ? await userControlDao.getUserById(user_id) : null;
    const fallbackAddressMobile = detailedAddress?.mobile || detailedAddress?.receiver_phone;
    const fallbackAddressName = detailedAddress?.receiver_name || detailedAddress?.full_name;
    const resolvedReceiverName =
      (receiver_name || fallbackAddressName || userRecord?.name || "").toString().trim();
    const rawMobile = (mobile || fallbackAddressMobile || userRecord?.phone || "")
      .toString()
      .replace(/\D/g, "");
    // Strip leading country code: +914444444444 → 4444444444
    const resolvedMobile = rawMobile.length === 12 && rawMobile.startsWith("91")
      ? rawMobile.slice(2)
      : rawMobile.length === 13 && rawMobile.startsWith("091")
        ? rawMobile.slice(3)
        : rawMobile;

    if (!resolvedReceiverName || resolvedReceiverName.length < 2 || resolvedMobile.length !== 10) {
      return res.status(400).json({
        success: false,
        error: "Please complete profile with valid name and mobile number before placing order",
      });
    }

    // Use charges from request (snapshot) or fetch current settings as fallback
    let finalChargeSettings = {
      handling_charge: handling_charge !== undefined ? parseFloat(handling_charge) : 0,
      surge_charge: surge_charge !== undefined ? parseFloat(surge_charge) : 0,
      platform_charge: platform_charge !== undefined ? parseFloat(platform_charge) : 0,
      discount_charge: discount_charge !== undefined ? parseFloat(discount_charge) : 0
    };

    if (handling_charge === undefined) {
      try {
        const settings = await chargeSettingDao.get();
        if (settings) {
          finalChargeSettings = {
            handling_charge: parseFloat(settings.handling_charge || 0),
            surge_charge: parseFloat(settings.surge_charge || 0),
            platform_charge: parseFloat(settings.platform_charge || 0),
            discount_charge: parseFloat(settings.discount_charge || 0)
          };
        }
      } catch (err) {
        console.error("Error fetching charge settings for order:", err);
      }
    }

    // ── Idempotency: return existing order if same key was already processed ──
    const idempotencyKey = req.headers?.['x-idempotency-key'] || null;
    if (idempotencyKey) {
      const existingOrder = await prisma.orders.findFirst({
        where: { idempotency_key: idempotencyKey },
        include: { sub_orders: true },
      });
      if (existingOrder) {
        return res.status(200).json({
          success: true,
          order: existingOrder,
          subOrders: (existingOrder.sub_orders || []).map(s => ({
            subOrderId: s.id,
            sourceType: s.source_type,
            fulfillmentStatus: s.fulfillment_status,
            estimatedDeliveryAt: s.estimated_delivery_at,
          })),
          _idempotent: true,
        });
      }
    }

    if (razorpay_signature) {
      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, error: "Invalid signature" });
      }
    }

    const addressString = [
      detailedAddress.houseNumber && detailedAddress.streetAddress
        ? `${detailedAddress.houseNumber} ${detailedAddress.streetAddress}`
        : detailedAddress.streetAddress,
      detailedAddress.suiteUnitFloor,
      detailedAddress.locality,
      detailedAddress.area,
      detailedAddress.city,
      detailedAddress.state,
      detailedAddress.postalCode,
      detailedAddress.country || "India",
      detailedAddress.landmark ? `Near ${detailedAddress.landmark}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const pincodeStr = detailedAddress.postalCode?.trim() || "";

    // ── Delivery validation with in-memory cache ──────────────────────────────
    // cartHash: stable key from sorted variant IDs + quantities + pincode
    const sortedItemsForHash = [...(items || [])].map(i => ({
      p: i.product_id || i.id,
      v: i.variant_id || i.variantId || '',
      q: parseInt(i.quantity, 10) || 1,
    })).sort((a, b) => (a.p + a.v).localeCompare(b.p + b.v));
    const cartHash = crypto.createHash('sha256')
      .update(JSON.stringify(sortedItemsForHash) + pincodeStr)
      .digest('hex');
    const validationCacheKey = `cart_validation:${user_id}:${cartHash}`;
    const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

    let deliverabilityValidation;
    const cachedValidation = cache.get(validationCacheKey);
    if (cachedValidation && (Date.now() - cachedValidation.validatedAt) < CACHE_MAX_AGE_MS) {
      deliverabilityValidation = cachedValidation.result;
    } else {
      deliverabilityValidation = await validateOrderDeliverability(items, pincodeStr);
      if (deliverabilityValidation.success) {
        cache.set(validationCacheKey, { validatedAt: Date.now(), result: deliverabilityValidation }, 600);
      }
    }

    if (!deliverabilityValidation.success) {
      return res.status(deliverabilityValidation.status).json(deliverabilityValidation);
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Resolve variant IDs first (needed for parallel warehouse lookup) ──────
    const itemsWithVariants = [];
    for (const item of items) {
      const productId = item.product_id || item.id;
      if (!productId) {
        return res.status(400).json({ success: false, error: "Order item is missing product_id" });
      }
      const quantity = parseInt(item.quantity, 10) || 1;
      const variantId = await resolveOrderItemVariantId(item, productId);
      if (!variantId) {
        return res.status(400).json({ success: false, error: `No variant found for product ${productId}` });
      }
      itemsWithVariants.push({ item, productId, quantity, variantId });
    }

    // ── Parallel warehouse selection — collects ALL failures at once ──────────
    const { successes: warehouseResults, failures: warehouseFailures } =
      await findWarehouseForProducts(
        itemsWithVariants.map(({ productId, variantId, quantity, item }) => ({
          productId,
          variantId,
          quantity,
          productType: item.product_type,
        })),
        deliverabilityValidation.pincode
      );

    if (warehouseFailures.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Some items are not available for your delivery pincode',
        undeliverableItems: warehouseFailures,
      });
    }

    // Merge warehouse results back with item metadata
    const preparedItems = itemsWithVariants.map(({ item, productId, quantity, variantId }, idx) => ({
      item,
      productId,
      quantity,
      variantId,
      warehouseInfo: warehouseResults[idx].warehouseInfo,
    }));
    // ─────────────────────────────────────────────────────────────────────────

    // ── Bulk pricing resolution (outside tx — requires external lookups) ────────
    const resolvedItems = [];
    let hasBulkOrder = false;
    for (const { item, productId, quantity, variantId, warehouseInfo } of preparedItems) {
      let finalPrice = parseFloat(item.price);
      let isBulkOrder = false;
      let bulkRange = null;
      const originalPrice = parseFloat(item.price);
      try {
        if (variantId) {
          const tier = await BulkPricingTiersDAO.getApplicableTier(variantId, quantity);
          if (tier) {
            isBulkOrder = true;
            hasBulkOrder = true;
            finalPrice = parseFloat(tier.unit_price);
            bulkRange = tier.max_quantity
              ? `${tier.min_quantity}-${tier.max_quantity}`
              : `${tier.min_quantity}+`;
          }
        }
      } catch (bulkErr) {
        console.error('Error checking bulk pricing tiers:', bulkErr);
      }
      resolvedItems.push({ item, productId, quantity, variantId, warehouseInfo, finalPrice, isBulkOrder, bulkRange, originalPrice });
    }

    // Resolve warehouse types (needed for sub-order grouping key, outside tx)
    const warehouseIds = [...new Set(resolvedItems.map(p => p.warehouseInfo?.warehouse_id).filter(Boolean))];
    const warehouseRows = await prisma.warehouses.findMany({
      where: { id: { in: warehouseIds } },
      select: { id: true, type: true },
    });
    const warehouseTypeMap = Object.fromEntries(warehouseRows.map(w => [w.id, w.type]));

    // Build sub-order groups (outside tx — pure JS, no DB)
    const sourceGroups = {};
    for (const { productId, quantity, variantId, warehouseInfo, finalPrice } of resolvedItems) {
      if (!warehouseInfo) continue;
      const wType = warehouseTypeMap[warehouseInfo.warehouse_id];
      const resolvedSourceType = wType === 'zonal' ? 'zonal' : (warehouseInfo.assignment_source === 'seller' ? 'seller' : 'division');
      const key = `${resolvedSourceType}__${warehouseInfo.warehouse_id}__${warehouseInfo.seller_id || ''}`;
      if (!sourceGroups[key]) {
        sourceGroups[key] = {
          source_type: resolvedSourceType,
          source_id: warehouseInfo.warehouse_id,
          seller_id: warehouseInfo.seller_id || null,
          items: [],
        };
      }
      sourceGroups[key].items.push({
        product_id: productId,
        variant_id: variantId,
        quantity,
        unit_price: finalPrice,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Atomic transaction: stock deduction + order + items + sub-orders + cart ──
    const estimatedDeliveryMinutes = { seller: 120, division: 120, zonal: 30 };

    const { order, createdSubOrders } = await prisma.$transaction(async (tx) => {
      // 1. Deduct stock atomically for each item
      for (const { variantId, quantity, warehouseInfo } of resolvedItems) {
        if (!warehouseInfo?.warehouse_id) continue;
        if (warehouseInfo.assignment_source === 'seller') {
          await tx.$executeRaw`
            UPDATE seller_products
            SET    stock_quantity     = GREATEST(0, stock_quantity - ${quantity}),
                   updated_at         = NOW()
            WHERE  seller_id    = ${warehouseInfo.seller_id}::uuid
              AND  variant_id   = ${variantId}::uuid
              AND  warehouse_id = ${warehouseInfo.warehouse_id}
          `;
        } else {
          await tx.$executeRaw`
            UPDATE inventory
            SET    stock_qty  = GREATEST(0, stock_qty - ${quantity}),
                   updated_at = NOW()
            WHERE  variant_id   = ${variantId}::uuid
              AND  warehouse_id = ${warehouseInfo.warehouse_id}
          `;
        }
      }

      // 2. Create master order
      const identity = await generateInvoiceIdentity(tx, "QK");

      const newOrder = await tx.orders.create({
        data: {
          user_id,
          subtotal: parseFloat(subtotal),
          shipping: parseFloat(shipping),
          total: parseFloat(total),
          address: addressString,
          payment_method,
          status: razorpay_payment_id ? "confirmed" : "pending",
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
          mobile: resolvedMobile,
          receiver_name: resolvedReceiverName,
          delivery_pincode: deliverabilityValidation.pincode,
          invoice_number: identity.invoice_number,
          irn: identity.irn,
          orn: identity.orn,
          invoice_generated_at: identity.invoice_generated_at,
          coupon_code: coupon_code || null,
          coupon_discount: coupon_discount ? parseFloat(coupon_discount) : 0,
          is_bulk_order: hasBulkOrder,
          ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
          ...finalChargeSettings,
        },
      });

      // 3. Create order items
      await tx.order_items.createMany({
        data: resolvedItems.map(({ variantId, quantity, finalPrice, isBulkOrder, bulkRange, originalPrice, warehouseInfo }) => ({
          order_id: newOrder.id,
          variant_id: variantId,
          quantity,
          price: finalPrice,
          is_bulk_order: isBulkOrder,
          bulk_range: bulkRange,
          original_price: isBulkOrder ? originalPrice : null,
          assigned_warehouse_id: warehouseInfo?.warehouse_id || null,
          warehouse_name: warehouseInfo?.warehouse_name || null,
        })),
        skipDuplicates: true,
      });

      // 4. Create sub-orders + sub-order items
      const subOrders = [];
      for (const group of Object.values(sourceGroups)) {
        const estimated_delivery_at = new Date(
          Date.now() + (estimatedDeliveryMinutes[group.source_type] || 120) * 60 * 1000
        );
        const subOrder = await tx.sub_orders.create({
          data: {
            parent_order_id: newOrder.id,
            source_type: group.source_type,
            source_id: group.source_id,
            seller_id: group.seller_id,
            fulfillment_status: 'pending',
            estimated_delivery_at,
          },
        });
        await tx.sub_order_items.createMany({
          data: group.items.map(i => ({ ...i, sub_order_id: subOrder.id })),
          skipDuplicates: true,
        });
        subOrders.push(subOrder);
      }

      // 5. Clear cart
      await tx.cart_items.deleteMany({ where: { user_id } });

      return { order: newOrder, createdSubOrders: subOrders };
    });
    // ─────────────────────────────────────────────────────────────────────────

    // Respond immediately — geocoding and fulfillment routing are queued below
    const response = res.status(201).json({
      success: true,
      order,
      subOrders: createdSubOrders.map(s => ({
        subOrderId: s.id,
        sourceType: s.source_type,
        fulfillmentStatus: s.fulfillment_status,
        estimatedDeliveryAt: s.estimated_delivery_at,
      })),
    });

    // Enqueue geocoding in background
    await publishJob('geocode_order', {
      orderId: order.id,
      addressString,
    });

    // Enqueue fulfillment routing in background
    await publishJob('fulfillment_routing', { orderId: order.id });

    return response;
  } catch (error) {
    console.error("Error in placeOrderWithDetailedAddress:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    console.log("Cancelling order:", id, "Reason:", reason || "No reason provided");

    // Get order details first
    const order = await orderDao.getById(id);

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    if (order.status === "cancelled") {
      return res.status(400).json({ success: false, error: "Order is already cancelled" });
    }

    if (order.status === "delivered") {
      return res.status(400).json({ success: false, error: "Delivered orders cannot be cancelled" });
    }

    // Update order status
    await orderDao.update(id, { status: "cancelled" });

    // Get user details for notifications
    const userData = order.users || await userControlDao.getUserById(order.user_id);

    // Create notifications for cancellation
    try {
      // await createOrderNotification(order.user_id, id, "cancelled", reason);
      // await createAdminCancelNotification(id, userData?.name || "Unknown User", reason);
    } catch (notificationError) {
      console.error("Error creating notifications:", notificationError);
    }

    // Auto-refund into wallet for prepaid orders
    let walletRefunded = false;
    if (order.payment_method === "Razorpay" || order.payment_method === "prepaid") {
      try {
        const refundAmount = parseFloat(order.total);
        // Find or create wallet
        let wallet = await walletDao.getByUserId(order.user_id);
        if (!wallet) {
          wallet = await walletDao.create(order.user_id);
        }

        await walletDao.updateBalance(
          wallet.id,
          refundAmount,
          'REFUND',
          'order_cancellation',
          id,
          `Refund for cancelled order #${id}`,
          {
            order_id: id,
            razorpay_payment_id: order.razorpay_payment_id || null,
            reason: reason || 'Order cancelled',
          }
        );

        walletRefunded = true;
        console.log(`Refunded ₹${refundAmount} to wallet for user ${order.user_id}, order ${id}`);
      } catch (refundError) {
        console.error("Error processing wallet refund:", refundError);
      }
    }

    console.log("Order cancelled successfully:", id);
    return res.json({
      success: true,
      message: "Order cancelled successfully",
      walletRefunded,
      refundAmount: walletRefunded ? parseFloat(order.total) : 0,
    });
  } catch (error) {
    console.error("Unexpected error in cancelOrder:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    // Step 1: Delete all order items for this order
    await orderItemDao.deleteByOrder(id);

    // Step 2: Delete the order
    await orderDao.delete(id);

    return res.json({
      success: true,
      message: "Order and its items deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/** Get order tracking timeline */
export const getOrderTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, error: "Order ID required" });
    }

    // Fetch order with related items + assigned rider info
    const order = await orderDao.getById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // Build a simple timeline
    const timeline = [];

    // Order placed
    if (order.created_at) {
      timeline.push({
        key: "placed",
        title: "Order Placed",
        timestamp: order.created_at,
        meta: null,
      });
    }

    // Map status to steps
    const status = order.status || "pending";

    if (
      status === "confirmed" ||
      status === "shipped" ||
      status === "delivered"
    ) {
      timeline.push({
        key: "confirmed",
        title: "Order Confirmed",
        timestamp: order.updated_at || null,
      });
    }

    if (status === "shipped" || status === "delivered") {
      timeline.push({
        key: "shipped",
        title: "Shipped",
        timestamp: order.updated_at || null,
      });
    }

    if (status === "delivered") {
      timeline.push({
        key: "delivered",
        title: "Delivered",
        timestamp: order.updated_at || null,
      });
    }

    if (status === "cancelled") {
      timeline.push({
        key: "cancelled",
        title: "Cancelled",
        timestamp: order.updated_at || null,
      });
    }

    // Deduping logic from original
    const seen = new Set();
    const deduped = [];
    for (const item of timeline) {
      const k = item.key + (item.timestamp || "");
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(item);
      }
    }

    // Include assigned rider info when available (dynamic — not hardcoded)
    let riderInfo = null;
    if (order.rider_id) {
        const riderRecord = await prisma.riders.findUnique({
            where: { id: order.rider_id },
            select: { users: { select: { name: true, phone: true } }, vehicle_type: true },
        });
        if (riderRecord) {
            riderInfo = {
                name: riderRecord.users?.name || null,
                phone: riderRecord.users?.phone || null,
                vehicle_type: riderRecord.vehicle_type || null,
            };
        }
    }

    // ✅ Get single delivery OTP from parent order (same for all sub-orders)
    const deliveryOtp = order?.delivery_otp || null;

    return res.json({
      success: true,
      order: order,
      tracking: deduped,
      rider: riderInfo,
      delivery_otp: deliveryOtp,
      message: deliveryOtp ? 'Share this OTP with all riders for their respective deliveries' : 'OTP will be generated when sub-orders are confirmed',
    });
  } catch (err) {
    console.error("getOrderTracking error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
};

// --- Order Items Logic ---

/** Get all order items (admin access or for analytics) */
export const getAllOrderItems = async (req, res) => {
  try {
    const items = await orderItemDao.listByOrder(null); // Assuming null lists all if handled, or I should update DAO
    return res.json({ success: true, orderItems: items });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/** Get order items by order_id (specific to one order) */
export const getOrderItemsByOrderId = async (req, res) => {
  try {
    const { order_id } = req.params;
    const items = await orderItemDao.listByOrder(order_id);
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/** Get order items for a specific product (analytics/reporting) */
export const getOrderItemsByProductId = async (req, res) => {
  try {
    const { product_id } = req.params;
    // We need to join with product_variants to filter by product_id
    const items = await prisma.order_items.findMany({
      where: { variant: { product_id } },
      include: {
        order: { select: { user_id: true, created_at: true } },
        variant: { include: { product: true } }
      }
    });
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/** Delete all order items for an order (for rollback or admin usage) */
export const deleteOrderItemsByOrderId = async (req, res) => {
  try {
    const { order_id } = req.params;
    await orderItemDao.deleteByOrder(order_id);
    return res.json({ success: true, message: "Order items deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// --- Razorpay Payment Logic (Merged from paymentController.js) ---

export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || isNaN(amount)) {
      return res
        .status(400)
        .json({ success: false, error: "Valid amount is required" });
    }

    const options = {
      amount: amount,
      currency: "INR",
      receipt: `receipt_${Math.floor(Math.random() * 1000000)}`,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyRazorpayPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const generatedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (generatedSignature === razorpay_signature) {
    return res.json({ success: true, message: "Payment verified" });
  } else {
    return res.status(400).json({ success: false, error: "Invalid signature" });
  }
};

export const verifyRazorpaySignature = (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    return res.json({ success: true, message: "Payment signature verified" });
  } else {
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }
};
