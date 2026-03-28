import affiliateDAO from "../dao/affiliate.dao.js";
import prisma from "../config/prisma.js";
import { generateLinkCode } from "../services/affiliateService.js";

// Middleware helper: get profile or 403
const requireProfile = async (userId) => {
  const profile = await affiliateDAO.getProfileByUserId(userId);
  if (!profile || profile.status !== "ACTIVE" || profile.is_blocked) return null;
  return profile;
};

// GET /api/affiliate/profile
export const getAffiliateProfile = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Affiliate account not found or inactive" });
    return res.json({ success: true, data: profile });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// PUT /api/affiliate/profile
export const updateAffiliateProfile = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Affiliate account not found" });

    const allowed = ["display_name", "phone", "website_url", "social_links",
      "payment_method", "bank_name", "bank_account_number", "bank_ifsc_code",
      "account_holder_name", "upi_id"];

    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }

    const updated = await affiliateDAO.updateProfile(profile.id, data);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/affiliate/dashboard
export const getAffiliateDashboard = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const stats = await affiliateDAO.getAffiliateDashboardStats(profile.id);
    return res.json({ success: true, data: stats });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/affiliate/commission-rates
export const getCommissionRates = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const [config, rates] = await Promise.all([
      affiliateDAO.getConfig(),
      affiliateDAO.getCategoryCommissions(),
    ]);

    return res.json({
      success: true,
      data: { defaultRate: config.default_commission_rate, rates },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── LINKS ───────────────────────────────────────────────────────────────────

// GET /api/affiliate/links
export const getLinks = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const { page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listLinksByAffiliate(profile.id, {
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/affiliate/links/generate
export const generateLink = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const { destination_type, product_id, category_id, search_query, campaign_name, sub_id } = req.body;

    if (!destination_type) {
      return res.status(400).json({ success: false, error: "destination_type is required" });
    }

    const frontendBase = process.env.FRONTEND_URL || "https://www.bigbestmart.com";
    let destinationUrl = frontendBase;
    let productName = null;
    let categoryName = null;

    if (destination_type === "PRODUCT" && product_id) {
      const product = await prisma.products.findUnique({
        where: { id: product_id },
        select: { id: true, name: true },
      });
      if (!product) return res.status(404).json({ success: false, error: "Product not found" });
      destinationUrl = `${frontendBase}/pages/products/${product_id}`;
      productName = product.name;
    } else if (destination_type === "CATEGORY" && category_id) {
      const cat = await prisma.categories.findUnique({
        where: { id: category_id },
        select: { id: true, name: true },
      });
      if (!cat) return res.status(404).json({ success: false, error: "Category not found" });
      destinationUrl = `${frontendBase}/pages/products?category=${category_id}`;
      categoryName = cat.name;
    } else if (destination_type === "SEARCH" && search_query) {
      destinationUrl = `${frontendBase}/pages/products?search=${encodeURIComponent(search_query)}`;
    }

    const linkCode = await generateLinkCode();
    const fullUrl = `${frontendBase}/api/affiliate/track/${linkCode}`;

    const link = await affiliateDAO.createLink({
      affiliate_id: profile.id,
      affiliate_code: profile.affiliate_code,
      link_code: linkCode,
      full_url: fullUrl,
      destination_type,
      destination_url: destinationUrl,
      product_id: product_id || null,
      product_name: productName,
      category_id: category_id || null,
      category_name: categoryName,
      search_query: search_query || null,
      campaign_name: campaign_name || null,
      sub_id: sub_id || null,
    });

    return res.status(201).json({ success: true, data: link });
  } catch (err) {
    console.error("generateLink error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// DELETE /api/affiliate/links/:id
export const deactivateLink = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const link = await affiliateDAO.getLinkById(req.params.id);
    if (!link || link.affiliate_id !== profile.id) {
      return res.status(404).json({ success: false, error: "Link not found" });
    }

    await affiliateDAO.deactivateLink(req.params.id);
    return res.json({ success: true, message: "Link deactivated" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── ORDERS & COMMISSIONS ─────────────────────────────────────────────────────

// GET /api/affiliate/orders
export const getAffiliateOrders = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const { status, page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listAffiliateOrders(profile.id, {
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/affiliate/commissions
export const getAffiliateCommissions = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const { status, page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listCommissions(profile.id, {
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── PAYOUTS ─────────────────────────────────────────────────────────────────

// GET /api/affiliate/payouts
export const getAffiliatePayouts = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const { page = 1, limit = 20 } = req.query;
    const result = await affiliateDAO.listPayouts(profile.id, {
      page: parseInt(page),
      limit: parseInt(limit),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/affiliate/payouts/request
export const requestPayout = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const config = await affiliateDAO.getConfig();
    const minPayout = Number(config.minimum_payout_amount);

    if (Number(profile.available_balance) < minPayout) {
      return res.status(400).json({
        success: false,
        error: `Minimum payout amount is ₹${minPayout}. Your available balance is ₹${profile.available_balance}`,
      });
    }

    const commissions = await affiliateDAO.getApprovedUnpaidCommissions(profile.id);
    if (!commissions.length) {
      return res.status(400).json({ success: false, error: "No approved commissions available for payout" });
    }

    const grossAmount = commissions.reduce((s, c) => s + Number(c.final_amount), 0);
    const tdsAmount = commissions.reduce((s, c) => s + Number(c.tds_amount), 0);
    const netAmount = grossAmount - tdsAmount;

    const { generatePayoutNumber } = await import("../services/affiliateService.js");
    const payoutNumber = await generatePayoutNumber();

    const payout = await affiliateDAO.createPayout({
      affiliate_id: profile.id,
      payout_number: payoutNumber,
      gross_amount: grossAmount,
      tds_amount: tdsAmount,
      net_amount: netAmount,
      commission_count: commissions.length,
      payment_method: profile.payment_method,
      bank_name: profile.bank_name,
      bank_account_number: profile.bank_account_number,
      bank_ifsc_code: profile.bank_ifsc_code,
      account_holder_name: profile.account_holder_name,
      upi_id: profile.upi_id,
      status: "PENDING",
    });

    // Link commissions to payout
    await prisma.affiliate_commissions.updateMany({
      where: { id: { in: commissions.map((c) => c.id) } },
      data: { payout_id: payout.id, status: "IN_PAYOUT" },
    });

    // Deduct from available balance
    await affiliateDAO.incrementProfileStats(profile.id, {
      available_balance: { decrement: grossAmount },
      processing_balance: { increment: grossAmount },
    });

    return res.status(201).json({ success: true, data: payout });
  } catch (err) {
    console.error("requestPayout error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// ─── PRODUCT BROWSING (affiliate uses existing catalog) ───────────────────────

// GET /api/affiliate/products
export const browseProducts = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const { search, category_id, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { active: true };
    if (category_id) where.category_id = category_id;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const [products, total] = await Promise.all([
      prisma.products.findMany({
        where,
        skip,
        take: parseInt(limit),
        select: {
          id: true, name: true, category_id: true,
          subcategory_id: true, group_id: true,
          variants: {
            where: { is_default: true, active: true },
            select: { id: true, price: true, photo_url: true, title: true },
            take: 1,
          },
          category: { select: { id: true, name: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.products.count({ where }),
    ]);

    return res.json({ success: true, data: products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// GET /api/affiliate/categories
export const browseCategories = async (req, res) => {
  try {
    const profile = await requireProfile(req.user.id);
    if (!profile) return res.status(403).json({ success: false, error: "Not an affiliate" });

    const categories = await prisma.categories.findMany({
      where: { active: true },
      select: { id: true, name: true, image_url: true, icon: true },
      orderBy: { name: "asc" },
    });

    return res.json({ success: true, data: categories });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
