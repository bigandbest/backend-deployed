import prisma from "../config/prisma.js";

class AffiliateDAO {
  // ─── CONFIG ─────────────────────────────────────────────────────────────────
  async getConfig() {
    let config = await prisma.affiliate_configs.findFirst();
    if (!config) {
      config = await prisma.affiliate_configs.create({ data: {} });
    }
    return config;
  }

  async updateConfig(data) {
    const config = await this.getConfig();
    return prisma.affiliate_configs.update({ where: { id: config.id }, data });
  }

  // ─── CATEGORY COMMISSIONS ────────────────────────────────────────────────────
  async upsertCategoryCommission(categoryId, data) {
    return prisma.affiliate_category_commissions.upsert({
      where: { category_id: categoryId },
      update: data,
      create: { category_id: categoryId, ...data },
    });
  }

  async getCategoryCommissions() {
    return prisma.affiliate_category_commissions.findMany({
      where: { is_active: true },
      orderBy: { category_name: "asc" },
    });
  }

  async getCategoryCommissionByCategory(categoryId) {
    return prisma.affiliate_category_commissions.findUnique({
      where: { category_id: categoryId },
    });
  }

  async deleteCategoryCommission(id) {
    return prisma.affiliate_category_commissions.update({
      where: { id },
      data: { is_active: false },
    });
  }

  // ─── APPLICATIONS ────────────────────────────────────────────────────────────
  async createApplication(data) {
    return prisma.affiliate_applications.create({ data });
  }

  async getApplicationById(id) {
    return prisma.affiliate_applications.findUnique({ where: { id } });
  }

  async getApplicationByUserId(userId) {
    return prisma.affiliate_applications.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
    });
  }

  async listApplications({ status, page = 1, limit = 20 } = {}) {
    const where = {};
    if (status) where.status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_applications.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.affiliate_applications.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async updateApplicationStatus(id, data) {
    return prisma.affiliate_applications.update({ where: { id }, data });
  }

  // ─── PROFILES ────────────────────────────────────────────────────────────────
  async createProfile(data) {
    return prisma.affiliate_profiles.create({ data });
  }

  async getProfileById(id) {
    return prisma.affiliate_profiles.findUnique({ where: { id } });
  }

  async getProfileByUserId(userId) {
    return prisma.affiliate_profiles.findUnique({ where: { user_id: userId } });
  }

  async getProfileByCode(affiliateCode) {
    return prisma.affiliate_profiles.findUnique({
      where: { affiliate_code: affiliateCode },
    });
  }

  async listProfiles({ status, page = 1, limit = 20 } = {}) {
    const where = {};
    if (status) where.status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_profiles.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.affiliate_profiles.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async updateProfile(id, data) {
    return prisma.affiliate_profiles.update({ where: { id }, data });
  }

  async incrementProfileStats(affiliateId, stats) {
    return prisma.affiliate_profiles.update({
      where: { id: affiliateId },
      data: stats,
    });
  }

  // ─── LINKS ───────────────────────────────────────────────────────────────────
  async createLink(data) {
    return prisma.affiliate_links.create({ data });
  }

  async getLinkByCode(linkCode) {
    return prisma.affiliate_links.findUnique({ where: { link_code: linkCode } });
  }

  async getLinkById(id) {
    return prisma.affiliate_links.findUnique({ where: { id } });
  }

  async listLinksByAffiliate(affiliateId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_links.findMany({
        where: { affiliate_id: affiliateId, is_active: true },
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.affiliate_links.count({ where: { affiliate_id: affiliateId, is_active: true } }),
    ]);
    return { items, total, page, limit };
  }

  async updateLink(id, data) {
    return prisma.affiliate_links.update({ where: { id }, data });
  }

  async deactivateLink(id) {
    return prisma.affiliate_links.update({ where: { id }, data: { is_active: false } });
  }

  // ─── CLICKS ──────────────────────────────────────────────────────────────────
  async createClick(data) {
    return prisma.affiliate_clicks.create({ data });
  }

  async countClicksToday(affiliateId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return prisma.affiliate_clicks.count({
      where: { affiliate_id: affiliateId, clicked_at: { gte: today } },
    });
  }

  async getClickStats(affiliateId, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return prisma.affiliate_clicks.groupBy({
      by: ["is_converted"],
      where: { affiliate_id: affiliateId, clicked_at: { gte: since } },
      _count: true,
    });
  }

  async markClickConverted(clickId, orderId) {
    return prisma.affiliate_clicks.update({
      where: { id: clickId },
      data: { is_converted: true, converted_at: new Date(), order_id: orderId },
    });
  }

  // ─── ORDERS ──────────────────────────────────────────────────────────────────
  async createAffiliateOrder(data) {
    return prisma.affiliate_orders.create({ data });
  }

  async getAffiliateOrderByOrderId(orderId) {
    return prisma.affiliate_orders.findUnique({ where: { order_id: orderId } });
  }

  async listAffiliateOrders(affiliateId, { status, page = 1, limit = 20 } = {}) {
    const where = { affiliate_id: affiliateId };
    if (status) where.commission_status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_orders.findMany({
        where,
        skip,
        take: limit,
        orderBy: { order_date: "desc" },
      }),
      prisma.affiliate_orders.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async updateAffiliateOrder(id, data) {
    return prisma.affiliate_orders.update({ where: { id }, data });
  }

  async listAllAffiliateOrders({ status, page = 1, limit = 20 } = {}) {
    const where = {};
    if (status) where.commission_status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_orders.findMany({
        where,
        skip,
        take: limit,
        orderBy: { order_date: "desc" },
        include: {
          affiliate_profile: {
            select: { affiliate_code: true, display_name: true, email: true },
          },
        },
      }),
      prisma.affiliate_orders.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  // ─── COMMISSIONS ─────────────────────────────────────────────────────────────
  async createCommission(data) {
    return prisma.affiliate_commissions.create({ data });
  }

  async getCommissionByOrderId(affiliateOrderId) {
    return prisma.affiliate_commissions.findUnique({
      where: { affiliate_order_id: affiliateOrderId },
    });
  }

  async listCommissions(affiliateId, { status, page = 1, limit = 20 } = {}) {
    const where = { affiliate_id: affiliateId };
    if (status) where.status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_commissions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { order_date: "desc" },
      }),
      prisma.affiliate_commissions.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async updateCommission(id, data) {
    return prisma.affiliate_commissions.update({ where: { id }, data });
  }

  async listAllCommissions({ status, page = 1, limit = 20 } = {}) {
    const where = {};
    if (status) where.status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_commissions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        include: {
          affiliate_profile: {
            select: { affiliate_code: true, display_name: true, email: true },
          },
        },
      }),
      prisma.affiliate_commissions.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getApprovedUnpaidCommissions(affiliateId) {
    return prisma.affiliate_commissions.findMany({
      where: { affiliate_id: affiliateId, status: "APPROVED", payout_id: null },
    });
  }

  // ─── PAYOUTS ─────────────────────────────────────────────────────────────────
  async createPayout(data) {
    return prisma.affiliate_payouts.create({ data });
  }

  async getPayoutById(id) {
    return prisma.affiliate_payouts.findUnique({ where: { id } });
  }

  async listPayouts(affiliateId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_payouts.findMany({
        where: { affiliate_id: affiliateId },
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.affiliate_payouts.count({ where: { affiliate_id: affiliateId } }),
    ]);
    return { items, total, page, limit };
  }

  async listAllPayouts({ status, page = 1, limit = 20 } = {}) {
    const where = {};
    if (status) where.status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.affiliate_payouts.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        include: {
          affiliate_profile: {
            select: { affiliate_code: true, display_name: true, email: true },
          },
        },
      }),
      prisma.affiliate_payouts.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async updatePayout(id, data) {
    return prisma.affiliate_payouts.update({ where: { id }, data });
  }

  // ─── ADMIN STATS ─────────────────────────────────────────────────────────────
  async getAdminDashboardStats() {
    const [
      totalAffiliates,
      activeAffiliates,
      pendingApplications,
      pendingPayouts,
      totalOrders,
      pendingCommissions,
    ] = await Promise.all([
      prisma.affiliate_profiles.count(),
      prisma.affiliate_profiles.count({ where: { status: "ACTIVE" } }),
      prisma.affiliate_applications.count({ where: { status: "PENDING" } }),
      prisma.affiliate_payouts.count({ where: { status: "PENDING" } }),
      prisma.affiliate_orders.count(),
      prisma.affiliate_commissions.aggregate({
        where: { status: "PENDING" },
        _sum: { final_amount: true },
      }),
    ]);

    return {
      totalAffiliates,
      activeAffiliates,
      pendingApplications,
      pendingPayouts,
      totalOrders,
      pendingCommissionAmount: pendingCommissions._sum.final_amount || 0,
    };
  }

  async getAffiliateDashboardStats(affiliateId) {
    const profile = await prisma.affiliate_profiles.findUnique({
      where: { id: affiliateId },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentClicks, recentOrders] = await Promise.all([
      prisma.affiliate_clicks.count({
        where: { affiliate_id: affiliateId, clicked_at: { gte: thirtyDaysAgo } },
      }),
      prisma.affiliate_orders.findMany({
        where: { affiliate_id: affiliateId, order_date: { gte: thirtyDaysAgo } },
        select: { final_order_value: true, commission_status: true, final_commission: true },
      }),
    ]);

    const recentSales = recentOrders.reduce(
      (sum, o) => sum + Number(o.final_order_value || 0),
      0,
    );
    const recentCommission = recentOrders.reduce(
      (sum, o) => sum + Number(o.final_commission || 0),
      0,
    );

    return { profile, recentClicks, recentOrders: recentOrders.length, recentSales, recentCommission };
  }
}

export default new AffiliateDAO();
