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

    const [stats, dashConfig] = await Promise.all([affiliateDAO.getAffiliateDashboardStats(profile.id), affiliateDAO.getConfig()]);
    // Q5: program_enabled is a hard override — surface the effective state, not the raw columns.
    const programEnabled = dashConfig?.is_enabled !== false;
    return res.json({
      success: true,
      data: {
        ...stats,
        program_enabled: programEnabled,
        new_links_enabled: programEnabled && dashConfig?.new_links_enabled !== false,
        withdrawal_enabled: dashConfig?.withdrawal_enabled !== false,
      },
    });
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

    // Q5/Q8: program_enabled is a hard override on new_links_enabled; existing links keep earning regardless.
    const linkConfig = await affiliateDAO.getConfig();
    if (!linkConfig.is_enabled || !linkConfig.new_links_enabled) {
      return res.status(400).json({ success: false, error: "New affiliate link creation is temporarily paused" });
    }

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
      destinationUrl = `${frontendBase}/pages/singleproduct/${product_id}`;
      productName = product.name;
    } else if (destination_type === "CATEGORY" && category_id) {
      const cat = await prisma.categories.findUnique({
        where: { id: category_id },
        select: { id: true, name: true },
      });
      if (!cat) return res.status(404).json({ success: false, error: "Category not found" });
      destinationUrl = `${frontendBase}/pages/categories?category=${encodeURIComponent(cat.name)}`;
      categoryName = cat.name;
    } else if (destination_type === "SEARCH" && search_query) {
      destinationUrl = `${frontendBase}/pages/categories?subcategory=${encodeURIComponent(search_query)}`;
    }

    const linkCode = await generateLinkCode();
    const separator = destinationUrl.includes("?") ? "&" : "?";
    const fullUrl = `${destinationUrl}${separator}ref=${profile.affiliate_code}`;

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
    if (!config.withdrawal_enabled) {
      return res.status(400).json({ success: false, error: "Payouts are temporarily paused" });
    }
    const minPayout = Number(config.minimum_payout_amount);

    if (Number(profile.available_balance) < minPayout) {
      return res.status(400).json({
        success: false,
        error: `Minimum payout amount is ₹${minPayout}. Your available balance is ₹${profile.available_balance}`,
      });
    }

    const { generatePayoutNumber } = await import("../services/affiliateService.js");
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

    // Everything below is one transaction. The atomic claim of the APPROVED, unpaid commissions comes first:
    // a concurrent/repeated request blocks on the row locks, then claims 0 rows and aborts with NO_COMMISSIONS,
    // so a commission can never be paid out twice or move the balance twice.
    let payout;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        payout = await prisma.$transaction(async (tx) => {
          const commissions = await tx.affiliate_commissions.findMany({
            where: { affiliate_id: profile.id, status: "APPROVED", payout_id: null },
          });
          if (!commissions.length) throw Object.assign(new Error("No approved commissions available for payout"), { code: "NO_COMMISSIONS" });

          const claimed = await tx.affiliate_commissions.updateMany({
            where: { id: { in: commissions.map((c) => c.id) }, status: "APPROVED", payout_id: null },
            data: { status: "IN_PAYOUT" },
          });
          if (claimed.count !== commissions.length) throw Object.assign(new Error("Commissions were claimed by another payout"), { code: "NO_COMMISSIONS" });

          // final_amount is already net of TDS (see approveCommission): gross = pre-TDS, net = what is owed.
          const grossAmount = round2(commissions.reduce((sum, c) => sum + Number(c.gross_commission), 0));
          const tdsAmount = round2(commissions.reduce((sum, c) => sum + Number(c.tds_amount), 0));
          const netAmount = round2(commissions.reduce((sum, c) => sum + Number(c.final_amount), 0));

          const created = await tx.affiliate_payouts.create({
            data: {
              affiliate_id: profile.id,
              payout_number: await generatePayoutNumber(),
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
            },
          });
          await tx.affiliate_commissions.updateMany({ where: { id: { in: commissions.map((c) => c.id) } }, data: { payout_id: created.id } });

          // available_balance was credited with final_amount at approval, so the same net amount moves out.
          await tx.affiliate_profiles.update({
            where: { id: profile.id },
            data: { available_balance: { decrement: netAmount }, processing_balance: { increment: netAmount } },
          });
          return created;
        });
        break;
      } catch (err) {
        if (err.code === "P2002" && attempt < 3) continue; // payout_number collision with another affiliate's request
        throw err;
      }
    }

    return res.status(201).json({ success: true, data: payout });
  } catch (err) {
    if (err.code === "NO_COMMISSIONS") return res.status(409).json({ success: false, error: err.message });
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
