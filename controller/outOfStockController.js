import prisma from '../config/prisma.js';
import userNotificationDao from '../dao/user-notification.dao.js';

// ─── ENQUIRY ────────────────────────────────────────────────────────────────

/**
 * POST /api/out-of-stock/enquiry
 * Submit an out-of-stock enquiry for a product.
 */
export const submitEnquiry = async (req, res) => {
  try {
    const {
      user_id,
      product_id,
      variant_id,
      quantity = 1,
      message = '',
      need_by,          // "Need by" date from the form
      templates = [],   // array of selected template names
    } = req.body;

    if (!user_id || !product_id) {
      return res.status(400).json({ success: false, error: 'user_id and product_id are required' });
    }

    // Build combined message from templates + custom
    const templateText = templates.length > 0 ? `Templates: ${templates.join(', ')}\n` : '';
    const fullMessage = `${templateText}${message}`.trim();

    const enquiry = await prisma.product_enquiries.create({
      data: {
        user_id,
        product_id,
        variant_id: variant_id || null,
        quantity: parseInt(quantity) || 1,
        message: fullMessage || 'Out-of-stock enquiry',
        delivery_timeline: need_by || null,   // Store "Need by" date here
        status: 'OPEN',
        // We use company_name field to tag the enquiry type
        company_name: 'OUT_OF_STOCK_ENQUIRY',
      },
    });

    return res.status(201).json({ success: true, enquiry });
  } catch (err) {
    console.error('submitEnquiry error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── NOTIFY ─────────────────────────────────────────────────────────────────

/**
 * POST /api/out-of-stock/notify
 * Register user to receive a bell notification when product is back in stock.
 */
export const registerNotify = async (req, res) => {
  try {
    const { user_id, product_id, variant_id } = req.body;

    if (!user_id || !product_id) {
      return res.status(400).json({ success: false, error: 'user_id and product_id are required' });
    }

    const record = await prisma.stock_notify_requests.upsert({
      where: { user_id_product_id: { user_id, product_id } },
      update: { notified: false, notified_at: null, variant_id: variant_id || null },
      create: { user_id, product_id, variant_id: variant_id || null },
    });

    return res.status(201).json({ success: true, record });
  } catch (err) {
    console.error('registerNotify error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * DELETE /api/out-of-stock/notify
 * Unregister user from notifications for a product.
 */
export const unregisterNotify = async (req, res) => {
  try {
    const { user_id, product_id } = req.body;
    if (!user_id || !product_id) {
      return res.status(400).json({ success: false, error: 'user_id and product_id are required' });
    }
    await prisma.stock_notify_requests.deleteMany({
      where: { user_id, product_id },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('unregisterNotify error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * GET /api/out-of-stock/notify-status?user_id=&product_id=
 * Check if user is registered to be notified for a product.
 */
export const getNotifyStatus = async (req, res) => {
  try {
    const { user_id, product_id } = req.query;
    if (!user_id || !product_id) {
      return res.json({ success: true, registered: false });
    }
    const record = await prisma.stock_notify_requests.findUnique({
      where: { user_id_product_id: { user_id, product_id } },
    });
    return res.json({ success: true, registered: !!record, record });
  } catch (err) {
    console.error('getNotifyStatus error:', err);
    return res.json({ success: true, registered: false });
  }
};

// ─── ADMIN ──────────────────────────────────────────────────────────────────

/**
 * GET /api/out-of-stock/enquiries
 * Admin: list all out-of-stock enquiries.
 */
export const getEnquiries = async (req, res) => {
  try {
    const enquiries = await prisma.product_enquiries.findMany({
      where: { company_name: 'OUT_OF_STOCK_ENQUIRY' },
      include: {
        products: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return res.json({ success: true, enquiries });
  } catch (err) {
    console.error('getEnquiries error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

/**
 * GET /api/out-of-stock/notify-requests
 * Admin: list all notify-when-in-stock requests.
 */
export const getNotifyRequests = async (req, res) => {
  try {
    const requests = await prisma.stock_notify_requests.findMany({
      include: {
        products: { select: { id: true, name: true } },
        users: { select: { id: true, email: true, name: true, phone: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return res.json({ success: true, requests });
  } catch (err) {
    console.error('getNotifyRequests error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// ─── INTERNAL: TRIGGER ON RESTOCK ───────────────────────────────────────────

/**
 * Called internally when a product's stock is updated to > 0.
 * Sends bell notifications to all registered users and marks them as notified.
 */
export const triggerNotifyOnRestock = async (productId) => {
  try {
    // Find all pending notify requests for this product
    const requests = await prisma.stock_notify_requests.findMany({
      where: { product_id: productId, notified: false },
      include: {
        products: { select: { id: true, name: true } },
      },
    });

    if (requests.length === 0) return { notified: 0 };

    const productName = requests[0]?.products?.name || 'A product';

    // Create bell notifications for all users
    const notifications = requests.map((r) => ({
      user_id: r.user_id,
      type: 'PRODUCT',
      title: `${productName} is back in stock! 🎉`,
      message: `Great news! "${productName}" is now available. Add it to your cart before it runs out.`,
      related_id: productId,
      related_type: 'product',
      is_read: false,
    }));

    await userNotificationDao.createMany(notifications);

    // Mark all requests as notified
    await prisma.stock_notify_requests.updateMany({
      where: { product_id: productId, notified: false },
      data: { notified: true, notified_at: new Date() },
    });

    console.log(`[Restock] Notified ${requests.length} users for product: ${productId}`);
    return { notified: requests.length };
  } catch (err) {
    console.error('triggerNotifyOnRestock error:', err);
    return { notified: 0, error: err.message };
  }
};
