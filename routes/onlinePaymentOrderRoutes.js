import express from "express";
import { placeOrderWithDetailedAddress } from "../controller/orderController.js";

const router = express.Router();

router.post("/create", placeOrderWithDetailedAddress);

export default router;
