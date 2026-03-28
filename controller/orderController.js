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
import warehouseStockDao from "../dao/product-warehouse-stock.dao.js";
import bulkProductSettingsDao from "../dao/bulk-product-settings.dao.js";
import cartDao from "../dao/cart.dao.js";
import refundRequestDao from "../dao/refund-request.dao.js";
import userControlDao from "../dao/user.dao.js";
import chargeSettingDao from "../dao/charge-setting.dao.js";
import prisma from "../config/prisma.js";
import { checkMultipleProductsDelivery } from "./deliveryValidationService.js";
import subOrderDao from "../dao/sub-order.dao.js";
import { routeSubOrders } from "../services/fulfillmentRouter.js";
import walletDao from "../dao/wallet.dao.js";
import { findWarehouseForProduct } from "../services/warehouseService.js";

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

  const deliveryCheck = await checkMultipleProductsDelivery(
    (items || []).map((item) => ({
      product_id: item.product_id || item.id || item.product?.id,
      quantity: parseInt(item.quantity, 10) || 1,
    })).filter((item) => item.product_id),
    normalizedPincode
  );

  if (!deliveryCheck.success) {
    return {
      success: false,
      error: deliveryCheck.error || "Unable to validate delivery availability",
      status: 500,
    };
  }

  if (!deliveryCheck.all_deliverable) {
    return {
      success: false,
      error: "Some items are not deliverable to this pincode",
      status: 400,
      unavailable_products: deliveryCheck.unavailable_products,
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

    return res.json({
      success: true,
      order: {
        ...order,
        timeline
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
      mobile,
      receiver_name
    } = req.body;

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

    // Extract pincode from address (assuming it's at the end)
    const addressParts = address.split(",");
    const pincode = addressParts[addressParts.length - 2]?.trim() || "000000";

    const deliverabilityValidation = await validateOrderDeliverability(items, pincode);
    if (!deliverabilityValidation.success) {
      return res.status(deliverabilityValidation.status).json(deliverabilityValidation);
    }

    const preparedItems = [];

    for (const item of items) {
      const productId = item.product_id || item.id || item.product?.id;
      if (!productId) {
        return res.status(400).json({ success: false, error: "Order item is missing product_id" });
      }

      const quantity = parseInt(item.quantity, 10) || 1;
      const variantId = await resolveOrderItemVariantId(item, productId);
      if (!variantId) {
        return res.status(400).json({ success: false, error: `No variant found for product ${productId}` });
      }

      const warehouseInfo = await findWarehouseForProduct(
        productId,
        deliverabilityValidation.pincode,
        item.product_type,
        quantity,
        variantId
      );

      if (!warehouseInfo) {
        return res.status(400).json({
          success: false,
          error: `Product ${productId} is not available for pincode ${deliverabilityValidation.pincode}`,
        });
      }

      preparedItems.push({ item, productId, quantity, variantId, warehouseInfo });
    }

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
      mobile: mobile || null,
      receiver_name: receiver_name || null,
      ...finalChargeSettings
    });

    // Process order items with warehouse assignment
    const orderItemsToInsert = [];
    const warehouseAssignments = [];

    for (const { item, productId, quantity, variantId, warehouseInfo } of preparedItems) {
      orderItemsToInsert.push({
        order_id: order.id,
        variant_id: variantId,
        quantity: quantity,
        price: parseFloat(item.price) || 0,
        assigned_warehouse_id: warehouseInfo?.warehouse_id || null,
        warehouse_name: warehouseInfo?.warehouse_name || null,
      });

      if (warehouseInfo) {
        warehouseAssignments.push({
          order_id: order.id,
          product_id: productId,
          warehouse_id: warehouseInfo.warehouse_id,
          quantity: quantity,
          priority: warehouseInfo.priority,
          fallback_level: warehouseInfo.fallback_level,
        });

        // If this item was allocated to a seller, update the whole order to belong to this seller
        // (Assuming a single order goes to a single seller for now, based on the first mapped item)
        if (warehouseInfo.seller_id) {
          await orderDao.update(order.id, { seller_id: warehouseInfo.seller_id });
        }
      }
    }

    if (orderItemsToInsert.length > 0) {
      await orderItemDao.createMany(orderItemsToInsert);
    }

    // Store warehouse assignments if any (Prisma doesn't have a DAO for this yet, so using raw or insert)
    // For now, I'll keep it as is if it's using supabase, but I should ideally have a DAO.
    // If I don't have a DAO for everything, I'll use Prisma directly if the model exists.
    if (warehouseAssignments.length > 0) {
      try {
        await prisma.order_warehouse_assignments.createMany({
          data: warehouseAssignments
        });
      } catch (assignmentError) {
        console.error("Error storing warehouse assignments:", assignmentError);
      }
    }

    // Clear user's cart
    await cartDao.clearCart(user_id);

    // ── Create sub-orders grouped by fulfillment source ──────────────────────
    try {
      // Resolve warehouse types upfront so seller-sourced items in division
      // warehouses are classified as 'division', matching backfill behaviour.
      const warehouseIds = [...new Set(
        preparedItems.map(p => p.warehouseInfo?.warehouse_id).filter(Boolean)
      )];
      const warehouses = await prisma.warehouses.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, type: true },
      });
      const warehouseTypeMap = Object.fromEntries(warehouses.map(w => [w.id, w.type]));

      const sourceGroups = {};
      for (const { productId, quantity, variantId, item, warehouseInfo } of preparedItems) {
        if (!warehouseInfo) continue;
        const wType = warehouseTypeMap[warehouseInfo.warehouse_id];
        const resolvedSourceType = wType === 'zonal' ? 'zonal' : 'division';
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
          unit_price: parseFloat(item.price) || 0,
        });
      }

      const estimatedDeliveryMinutes = { division: 120, zonal: 30 };

      for (const group of Object.values(sourceGroups)) {
        const subOrder = await subOrderDao.create({
          parent_order_id: order.id,
          source_type: group.source_type,
          source_id: group.source_id,
          seller_id: group.seller_id,
          fulfillment_status: 'pending',
          estimated_delivery_at: new Date(
            Date.now() + (estimatedDeliveryMinutes[group.source_type] || 120) * 60 * 1000
          ),
        });

        await prisma.sub_order_items.createMany({
          data: group.items.map(i => ({ ...i, sub_order_id: subOrder.id })),
          skipDuplicates: true,
        });
      }

      routeSubOrders(order.id).catch(err =>
        console.error('Fulfillment routing error:', err.message)
      );
    } catch (subOrderErr) {
      console.error('Sub-order creation error:', subOrderErr.message, subOrderErr.stack);
    }
    // ─────────────────────────────────────────────────────────────────────────

    return res.json({
      success: true,
      order,
      warehouse_assignments: warehouseAssignments,
    });
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
      gpsLocation,
      handling_charge,
      surge_charge,
      platform_charge,
      discount_charge,
      coupon_code,
      coupon_discount,
      mobile,
      receiver_name
    } = req.body;

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

    // Fetch seller_id from the first item to group the order to that seller
    let seller_id = null;
    if (items && items.length > 0) {
      const firstProductId = items[0].product_id || items[0].id;
      try {
        const firstProduct = await productDao.getProductById(firstProductId);
        if (firstProduct && firstProduct.seller_id) {
          seller_id = firstProduct.seller_id;
        }
      } catch (err) {
        console.error("Error fetching first product for seller_id assignment:", err);
      }
    }

    const pincodeStr = detailedAddress.postalCode?.trim() || "";
    const deliverabilityValidation = await validateOrderDeliverability(items, pincodeStr);
    if (!deliverabilityValidation.success) {
      return res.status(deliverabilityValidation.status).json(deliverabilityValidation);
    }

    const preparedItems = [];

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

      const warehouseInfo = await findWarehouseForProduct(
        productId,
        deliverabilityValidation.pincode,
        item.product_type,
        quantity,
        variantId
      );

      if (!warehouseInfo) {
        return res.status(400).json({
          success: false,
          error: `Product ${productId} is not available for pincode ${deliverabilityValidation.pincode}`,
        });
      }

      preparedItems.push({ item, productId, quantity, variantId, warehouseInfo });
    }

    const orderData = {
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
      mobile: mobile || detailedAddress.mobile || null,
      receiver_name: receiver_name || detailedAddress.receiver_name || null,
      delivery_pincode: deliverabilityValidation.pincode,
      coupon_code: coupon_code || null,
      coupon_discount: coupon_discount ? parseFloat(coupon_discount) : 0,
      seller_id,
      ...finalChargeSettings
    };

    const order = await orderDao.create(orderData);

    // Process order items with bulk order detection
    const orderItemsToInsert = [];
    let hasBulkOrder = false;

    for (const { item, productId, quantity, variantId, warehouseInfo } of preparedItems) {
      let finalPrice = parseFloat(item.price);
      let isBulkOrder = false;
      let bulkRange = null;
      let originalPrice = parseFloat(item.price);

      try {
        const bulkSettingsList = await bulkProductSettingsDao.getSettings(productId);
        const bulkSettings = bulkSettingsList.find(s => s.is_bulk_enabled && quantity >= s.min_quantity && (!s.max_quantity || quantity <= s.max_quantity));

        if (bulkSettings) {
          isBulkOrder = true;
          hasBulkOrder = true;
          finalPrice = parseFloat(bulkSettings.bulk_price);
          bulkRange = bulkSettings.max_quantity
            ? `${bulkSettings.min_quantity}-${bulkSettings.max_quantity}`
            : `${bulkSettings.min_quantity}+`;

          console.log(`Bulk pricing applied for product ${productId}: ${quantity} units at ₹${finalPrice}`);
        }
      } catch (bulkCheckError) {
        console.error("Error checking bulk settings:", bulkCheckError);
      }

      orderItemsToInsert.push({
        order_id: order.id,
        variant_id: variantId,
        quantity: quantity,
        price: finalPrice,
        is_bulk_order: isBulkOrder,
        bulk_range: bulkRange,
        original_price: isBulkOrder ? originalPrice : null,
        assigned_warehouse_id: warehouseInfo?.warehouse_id || null,
        warehouse_name: warehouseInfo?.warehouse_name || null,
      });

      // Update the whole order's assigned seller if a target local seller is found
      if (warehouseInfo && warehouseInfo.seller_id) {
        await orderDao.update(order.id, { seller_id: warehouseInfo.seller_id });
      }
    }

    if (hasBulkOrder) {
      await orderDao.update(order.id, { is_bulk_order: true });
    }

    if (orderItemsToInsert.length > 0) {
      await orderItemDao.createMany(orderItemsToInsert);
    }

    // Reduce inventory
    for (const { productId, quantity, warehouseInfo } of preparedItems) {

      try {
        if (warehouseInfo?.warehouse_id) {
          await warehouseStockDao.confirmStockDeduction(productId, warehouseInfo.warehouse_id, quantity, order.id);
        }

        // Also update total product stock
        const product = await productDao.getById(productId);
        if (product) {
          const currentStock = product.stock_quantity || product.stock || 0;
          const newStock = Math.max(0, currentStock - quantity);
          await productDao.update(productId, {
            stock_quantity: newStock,
            stock: newStock
          });
        }
      } catch (stockError) {
        console.error(`Error reducing stock for product ${productId}:`, stockError);
      }
    }

    // Clear cart
    await cartDao.clearCart(user_id);

    // ── Create sub-orders grouped by fulfillment source ──────────────────────
    try {
      // Resolve warehouse types so seller-sourced items in division warehouses
      // are classified as 'division', matching backfill behaviour.
      const warehouseIds = [...new Set(
        preparedItems.map(p => p.warehouseInfo?.warehouse_id).filter(Boolean)
      )];
      const warehouses = await prisma.warehouses.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, type: true },
      });
      const warehouseTypeMap = Object.fromEntries(warehouses.map(w => [w.id, w.type]));

      const sourceGroups = {};
      for (const { productId, quantity, variantId, item, warehouseInfo } of preparedItems) {
        if (!warehouseInfo) continue;
        const wType = warehouseTypeMap[warehouseInfo.warehouse_id];
        const resolvedSourceType = wType === 'zonal' ? 'zonal' : 'division';
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
          unit_price: parseFloat(item.price),
        });
      }

      const estimatedDeliveryMinutes = { division: 120, zonal: 30 };

      for (const group of Object.values(sourceGroups)) {
        const estimated_delivery_at = new Date(
          Date.now() + (estimatedDeliveryMinutes[group.source_type] || 120) * 60 * 1000
        );

        const subOrder = await subOrderDao.create({
          parent_order_id: order.id,
          source_type: group.source_type,
          source_id: group.source_id,
          seller_id: group.seller_id,
          fulfillment_status: 'pending',
          estimated_delivery_at,
        });

        // Create sub-order items
        await prisma.sub_order_items.createMany({
          data: group.items.map(i => ({ ...i, sub_order_id: subOrder.id })),
          skipDuplicates: true,
        });
      }

      // Trigger fulfillment routing asynchronously (non-blocking)
      routeSubOrders(order.id).catch(err =>
        console.error('Fulfillment routing error:', err.message)
      );
    } catch (subOrderErr) {
      // Sub-order creation failure is non-fatal — order is already placed
      console.error('Sub-order creation error:', subOrderErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    return res.json({ success: true, order });
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

    // Fetch order with related items
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

    return res.json({ success: true, order: order, tracking: deduped });
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
