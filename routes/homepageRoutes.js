import express from "express";
import { getHomepageBootstrap } from "../controller/homepageController.js";

const router = express.Router();

router.get("/bootstrap", getHomepageBootstrap);

export default router;
