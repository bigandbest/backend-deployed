import prisma from '../config/prisma.js';

class BulkPricingTiersDAO {
  async getByVariantId(variantId) {
    return prisma.bulk_pricing_tiers.findMany({
      where: { variant_id: variantId },
      orderBy: { min_quantity: 'asc' },
    });
  }

  async getApplicableTier(variantId, quantity) {
    const tiers = await this.getByVariantId(variantId);
    if (!tiers.length) return null;
    // Find the highest tier whose min_quantity is met
    let match = null;
    for (const tier of tiers) {
      const withinMax = tier.max_quantity === null || quantity <= tier.max_quantity;
      if (quantity >= tier.min_quantity && withinMax) {
        match = tier;
      }
    }
    return match;
  }

  async replaceForVariant(variantId, tiers) {
    await prisma.bulk_pricing_tiers.deleteMany({ where: { variant_id: variantId } });
    if (!tiers || tiers.length === 0) return [];
    return prisma.bulk_pricing_tiers.createMany({
      data: tiers.map((t, idx) => ({
        variant_id: variantId,
        min_quantity: parseInt(t.min_quantity),
        max_quantity: t.max_quantity ? parseInt(t.max_quantity) : null,
        unit_price: parseFloat(t.unit_price),
        sort_order: t.sort_order ?? idx,
      })),
    });
  }

  async deleteByVariantId(variantId) {
    return prisma.bulk_pricing_tiers.deleteMany({ where: { variant_id: variantId } });
  }
}

export default new BulkPricingTiersDAO();
