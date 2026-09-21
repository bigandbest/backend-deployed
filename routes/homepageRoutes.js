import express from "express";
import { getHomepageFeed, getHomepageSections } from "../controller/homepageFeedController.js";

const router = express.Router();

// v1 contract. Both are public and read-only; HOMEPAGE_FEED_ENABLED (default true) is the emergency kill switch.
router.get("/feed", getHomepageFeed);
router.get("/sections", getHomepageSections);

export default router;
