// routes/cartRoutes.js
import express from "express";
import {
  getCartItems,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  validateCartDelivery,
  reserveCartStock,
  confirmCartStockDeduction,
} from "../controller/cartController.js";

const router = express.Router();

router.get("/:user_id", getCartItems);
router.post("/add", addToCart);
router.put("/update/:cart_item_id", updateCartItem);
router.delete("/remove/:cart_item_id", removeCartItem);
router.delete("/clear/:user_id", clearCart);
router.post("/validate-delivery", validateCartDelivery);
router.post("/reserve-stock", reserveCartStock);
router.post("/confirm-stock-deduction", confirmCartStockDeduction);

export default router;
