import BulkPricingTiersDAO from '../dao/bulk-pricing-tiers.dao.js';

// GET /productsroute/variants/:variantId/tiers
export const getVariantTiers = async (req, res) => {
  try {
    const { variantId } = req.params;
    const tiers = await BulkPricingTiersDAO.getByVariantId(variantId);
    return res.json({ success: true, tiers });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// POST /productsroute/tier-price
// Body: { variant_id, quantity }
export const getTierPrice = async (req, res) => {
  try {
    const { variant_id, quantity } = req.body;
    if (!variant_id || !quantity) {
      return res.status(400).json({ success: false, error: 'variant_id and quantity are required' });
    }
    const tier = await BulkPricingTiersDAO.getApplicableTier(variant_id, parseInt(quantity));
    return res.json({
      success: true,
      has_bulk_pricing: !!tier,
      unit_price: tier ? parseFloat(tier.unit_price) : null,
      tier: tier
        ? {
            id: tier.id,
            min_quantity: tier.min_quantity,
            max_quantity: tier.max_quantity,
            unit_price: parseFloat(tier.unit_price),
          }
        : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
