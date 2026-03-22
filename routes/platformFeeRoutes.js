import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import { requireAdmin, requireSeller } from "../middleware/authorize.js";
import {
  createPlatformFee,
  createPlatformFeeGroup,
  deletePlatformFeeConfig,
  getAllPlatformFeeGroups,
  getAllPlatformFees,
  getMySellerProductFee,
  getPlatformFeeForProduct,
  removePlatformFeeGroup,
  resolvePlatformFee,
} from "../controller/platformFeeController.js";

const router = express.Router();

// Public/common read APIs
router.get("/resolve", resolvePlatformFee);
router.get("/product/:productId", getPlatformFeeForProduct);

// Seller API (only for mapped products)
router.get(
  "/seller/product/:productId",
  authenticateToken,
  requireSeller,
  getMySellerProductFee,
);

// Admin management APIs
router.get("/admin/list", authenticateToken, requireAdmin, getAllPlatformFees);
router.get("/admin/groups", authenticateToken, requireAdmin, getAllPlatformFeeGroups);
router.post("/admin", authenticateToken, requireAdmin, createPlatformFee);
router.post("/admin/group", authenticateToken, requireAdmin, createPlatformFeeGroup);
router.delete(
  "/admin/group/:groupId",
  authenticateToken,
  requireAdmin,
  removePlatformFeeGroup,
);
router.delete(
  "/admin/:entity_type/:entity_id",
  authenticateToken,
  requireAdmin,
  deletePlatformFeeConfig,
);

export default router;
