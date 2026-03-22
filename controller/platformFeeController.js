import prisma from "../config/prisma.js";
import {
  assignPlatformFee,
  assignPlatformFeeGroup,
  deletePlatformFeeGroup,
  getPlatformFeeByProductId,
  listPlatformFeeGroups,
  listPlatformFees,
  removePlatformFee,
  resolveApplicablePlatformFee,
} from "../services/platformFeeService.js";

export const createPlatformFee = async (req, res) => {
  try {
    const { entity_type, entity_id, fee_percentage } = req.body || {};
    if (!entity_type || !entity_id || fee_percentage === undefined) {
      return res.status(400).json({
        success: false,
        error: "entity_type, entity_id and fee_percentage are required",
      });
    }

    const created = await assignPlatformFee({
      entityType: entity_type,
      entityId: entity_id,
      feePercentage: fee_percentage,
      createdBy: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Platform fee assigned successfully",
      data: {
        ...created,
        fee_percentage: Number(created.fee_percentage),
      },
    });
  } catch (error) {
    const status = error.message?.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: error.message || "Failed to assign platform fee",
    });
  }
};

export const deletePlatformFeeConfig = async (req, res) => {
  try {
    const { entity_type, entity_id } = req.params;
    if (!entity_type || !entity_id) {
      return res.status(400).json({
        success: false,
        error: "entity_type and entity_id are required",
      });
    }

    const removed = await removePlatformFee({
      entityType: entity_type,
      entityId: entity_id,
    });

    return res.status(200).json({
      success: true,
      message: "Platform fee removed successfully",
      data: {
        ...removed,
        fee_percentage: Number(removed.fee_percentage),
      },
    });
  } catch (error) {
    const status = error.message?.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: error.message || "Failed to remove platform fee",
    });
  }
};

export const getAllPlatformFees = async (_req, res) => {
  try {
    const fees = await listPlatformFees();
    return res.status(200).json({
      success: true,
      data: fees,
      count: fees.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch platform fees",
    });
  }
};

export const createPlatformFeeGroup = async (req, res) => {
  try {
    const { group_name, entity_type, entity_ids, fee_percentage } = req.body || {};
    if (!entity_type || !Array.isArray(entity_ids) || entity_ids.length === 0 || fee_percentage === undefined) {
      return res.status(400).json({
        success: false,
        error: "entity_type, entity_ids[] and fee_percentage are required",
      });
    }

    const created = await assignPlatformFeeGroup({
      groupName: group_name,
      entityType: entity_type,
      entityIds: entity_ids,
      feePercentage: fee_percentage,
      createdBy: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Platform fee group assigned successfully",
      data: created,
    });
  } catch (error) {
    const status = error.message?.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: error.message || "Failed to assign platform fee group",
    });
  }
};

export const getAllPlatformFeeGroups = async (_req, res) => {
  try {
    const groups = await listPlatformFeeGroups();
    return res.status(200).json({
      success: true,
      data: groups,
      count: groups.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch platform fee groups",
    });
  }
};

export const removePlatformFeeGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!groupId) {
      return res.status(400).json({
        success: false,
        error: "groupId is required",
      });
    }

    const removed = await deletePlatformFeeGroup(groupId);
    return res.status(200).json({
      success: true,
      message: "Platform fee group removed successfully",
      data: removed,
    });
  } catch (error) {
    const status = error.message?.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: error.message || "Failed to remove platform fee group",
    });
  }
};

export const resolvePlatformFee = async (req, res) => {
  try {
    const { category_id, subcategory_id, group_id, price } = req.query;

    const resolved = await resolveApplicablePlatformFee({
      categoryId: category_id || null,
      subcategoryId: subcategory_id || null,
      groupId: group_id || null,
    });

    const basePrice = price !== undefined ? Number(price) : null;
    const platformFeeAmount =
      basePrice !== null && Number.isFinite(basePrice)
        ? Number(((basePrice * resolved.fee_percentage) / 100).toFixed(2))
        : null;
    const sellerEarnings =
      basePrice !== null && Number.isFinite(basePrice)
        ? Number((basePrice - platformFeeAmount).toFixed(2))
        : null;

    return res.status(200).json({
      success: true,
      data: {
        fee_percentage: resolved.fee_percentage,
        source_level: resolved.source_level,
        source_entity_id: resolved.source_entity_id,
        source_type: resolved.source_type || null,
        ...(resolved.source_group_id ? { source_group_id: resolved.source_group_id } : {}),
        ...(resolved.source_group_name ? { source_group_name: resolved.source_group_name } : {}),
        ...(basePrice !== null ? { base_price: basePrice } : {}),
        ...(platformFeeAmount !== null ? { platform_fee_amount: platformFeeAmount } : {}),
        ...(sellerEarnings !== null ? { seller_earnings: sellerEarnings } : {}),
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to resolve platform fee",
    });
  }
};

export const getPlatformFeeForProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({ success: false, error: "productId is required" });
    }

    const data = await getPlatformFeeByProductId(productId);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const status = error.message?.toLowerCase().includes("not found") ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: error.message || "Failed to fetch product platform fee",
    });
  }
};

export const getMySellerProductFee = async (req, res) => {
  try {
    const { productId } = req.params;
    const seller = await prisma.sellers.findUnique({
      where: { user_id: req.user.id },
      select: { id: true },
    });

    if (!seller) {
      return res.status(404).json({ success: false, error: "Seller profile not found" });
    }

    const sellerProduct = await prisma.seller_products.findFirst({
      where: {
        seller_id: seller.id,
        product_id: productId,
      },
      select: { id: true },
    });

    if (!sellerProduct) {
      return res.status(404).json({
        success: false,
        error: "Seller is not mapped to this product",
      });
    }

    const data = await getPlatformFeeByProductId(productId);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to fetch seller fee",
    });
  }
};
