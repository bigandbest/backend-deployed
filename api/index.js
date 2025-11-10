import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - try multiple paths for Vercel
// Fixed path-to-regexp errors by removing invalid route patterns
dotenv.config();
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Import routes - adjust paths to go up one directory
import authRoutes from "../routes/authRoute.js";
import geoAddressRoute from "../routes/geoAddressRoute.js";
import warehouseRoute from "../routes/warehouseRoute.js";
import productWarehouseRoute from "../routes/productWarehouseRoutes.js";
import productsRoute from "../routes/productRoutes.js";
import locationRoute from "../routes/locationRoutes.js";
import locationSearchRoute from "../routes/locationRoute.js";
import stockRoutes from "../routes/stockRoutes.js";
import cartRoutes from "../routes/cartRoutes.js";
import orderRoutes from "../routes/orderRoutes.js";
import orderItemsRoutes from "../routes/orderItemsRoutes.js";
import checkCartAvailabilityRoute from "../routes/checkCartAvailabilityRoute.js";
import paymentRoutes from "../routes/paymentRoutes.js";
import notificationRoutes from "../routes/notificationRoutes.js";
import bnbRoutes from "../routes/b&bRoutes.js";
import bnbGroupRoutes from "../routes/b&bGroupRoutes.js";
import bnbGroupProductRoutes from "../routes/b&bGroupProductRoutes.js";
import bbmDostRoutes from "../routes/bbmDostRoutes.js";
import brandRoutes from "../routes/brandRoutes.js";
import brandProductsRoutes from "../routes/brandProducts.js";
import recommendedStoreRoutes from "../routes/recommendedStoreRoutes.js";
import productRecommendedStoreRoutes from "../routes/productRecommendedStoreRoutes.js";
import quickPickRoutes from "../routes/quickPickRoutes.js";
import quickPickGroupRoutes from "../routes/quickPickGroupRoutes.js";
import quickPickGroupProductRoutes from "../routes/quickPickGroupProductRoutes.js";
import savingZoneRoutes from "../routes/savingZoneRoutes.js";
import savingZoneGroupRoutes from "../routes/savingZoneGroupRoutes.js";
import savingZoneGroupProductRoutes from "../routes/savingZoneGroupProductRoutes.js";
import storeRoutes from "../routes/storeRoute.js";
import subStoreRoutes from "../routes/subStoreRoute.js";
import YouMayLikeProductRoutes from "../routes/youMayLikeRoutes.js";
import addBannerRoutes from "../routes/addBannerRoutes.js";
import addBannerGroupRoutes from "../routes/addBannerGroupRoutes.js";
import addBannerGroupProductRoutes from "../routes/addBannerGroupProductRoutes.js";
import uniqueSectionRoutes from "../routes/uniqueSectionRoutes.js";
import uniqueSectionProductRoutes from "../routes/uniqueSectionProductRoutes.js";
import profileRoutes from "../routes/profileRoutes.js";
import returnOrderRoutes from "../routes/returnOrderRoutes.js";
import walletRoutes from "../routes/walletRoutes.js";
import refundRoutes from "../routes/refundRoutes.js";
import debugRoutes from "../routes/debugRoutes.js";
import dailyDealsRoutes from "../routes/dailyDealsRoutes.js";
import dailyDealsProductRoutes from "../routes/dailyDealsProductRoutes.js";
import quickFixRoutes from "../routes/quickFixRoutes.js";
import trackingRoutes from "../routes/trackingRoutes.js";
import categoryRoutes from "../routes/categoryRoutes.js";
import bulkOrderRoutes from "../routes/bulkOrderRoutes.js";
import bulkProductRoutes from "../routes/bulkProductRoutes.js";
import productVariantsRoutes from "../routes/productVariantsRoutes.js";
import variantRoutes from "../routes/variantRoutes.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import shopByStoreRoutes from "../routes/shopByStoreRoutes.js";
import videoCardRoutes from "../routes/videoCardRoutes.js";
import productSectionRoutes from "../routes/productSectionRoutes.js";
import promoBannerRoutes from "../routes/promoBannerRoutes.js";
import storeSectionMappingRoutes from "../routes/storeSectionMappingRoutes.js";
import bulkWholesaleRoutes from "../routes/bulkWholesaleRoutes.js";
import codOrderRoutes from "../routes/codOrderRoutes.js";
import zoneRoutes from "../routes/zoneRoutes.js";

const app = express();

// Simple CORS configuration - Allow specific origins
const allowedOrigins = [
  "https://big-best-admin.vercel.app", // Production frontend
  "http://localhost:5173", // Development frontend
  "http://localhost:3000", // Alternative dev port
];

app.use(
  cors({
    origin: "*", // Temporarily allow all origins for debugging
    credentials: true, // Allow credentials
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "apikey",
      "x-client-info",
    ],
  })
);

// Handle preflight globally - removed invalid pattern
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

// Debug middleware to log Origin header
app.use((req, res, next) => {
  console.log("Origin:", req.headers.origin);
  next();
});
app.use(express.json());
app.use(cookieParser());

// Mount all routes
app.use("/api/business", authRoutes);
app.use("/api/geo-address", geoAddressRoute);
app.use("/api/warehouse", warehouseRoute);

// Add CORS middleware specifically for these problematic routes
app.use("/api/warehouses", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use("/api/warehouses", warehouseRoute); // Add alias for plural form
app.use("/api/productwarehouse", productWarehouseRoute);
app.use("/api/productsroute", productsRoute);
app.use("/api/locationsroute", locationRoute);
app.use("/api/location-search", locationSearchRoute);
app.use("/api/stock", stockRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/orderItems", orderItemsRoutes);
app.use("/api/check", checkCartAvailabilityRoute);
app.use("/api/payment", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/bnb", bnbRoutes);
app.use("/api/bnb-group", bnbGroupRoutes);
app.use("/api/bnb-group-product", bnbGroupProductRoutes);
app.use("/api/bbm-dost", bbmDostRoutes);
app.use("/api/brand", brandRoutes);
app.use("/api/product-brand", brandProductsRoutes);
app.use("/api/recommended-stores", recommendedStoreRoutes);
app.use("/api/product-recommended-stores", productRecommendedStoreRoutes);
app.use("/api/quick-pick", quickPickRoutes);
app.use("/api/quick-pick-group", quickPickGroupRoutes);
app.use("/api/quick-pick-group-product", quickPickGroupProductRoutes);
app.use("/api/saving-zone", savingZoneRoutes);
app.use("/api/saving-zone-group", savingZoneGroupRoutes);
app.use("/api/saving-zone-group-product", savingZoneGroupProductRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/sub-stores", subStoreRoutes);
app.use("/api/you-may-like-products", YouMayLikeProductRoutes);
app.use("/api/banner", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use("/api/banner", addBannerRoutes);
app.use("/api/banner-groups", addBannerGroupRoutes);
app.use("/api/banner-group-products", addBannerGroupProductRoutes);
app.use("/api/unique-sections", uniqueSectionRoutes);
app.use("/api/unique-sections-products", uniqueSectionProductRoutes);
app.use("/api/user", profileRoutes);
app.use("/api/return-orders", returnOrderRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/refund", refundRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api/daily-deals", dailyDealsRoutes);
app.use("/api/daily-deals-product", dailyDealsProductRoutes);
app.use("/api/quick", quickFixRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/bulk-orders", bulkOrderRoutes);
app.use("/api/bulk-products", bulkProductRoutes);
app.use("/api/product-variants", productVariantsRoutes);
app.use("/api/variants", variantRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/shop-by-stores", shopByStoreRoutes);
app.use("/api/video-cards", videoCardRoutes);
app.use("/api/product-sections", productSectionRoutes);
app.use("/api/promo-banner", promoBannerRoutes);
app.use("/api/store-section-mappings", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use("/api/store-section-mappings", storeSectionMappingRoutes);
app.use("/api/bulk-wholesale", bulkWholesaleRoutes);
app.use("/api/cod-orders", codOrderRoutes);

// Add CORS middleware specifically for zones route
app.use("/api/zones", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use("/api/zones", zoneRoutes);
console.log("✅ Zone routes mounted at /api/zones");

// Simple test endpoints for debugging CORS
app.get("/api/zones-test", (req, res) => {
  console.log("🧪 /api/zones-test called");
  res.json({
    success: true,
    message: "Zones test endpoint working",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/warehouses-test", (req, res) => {
  console.log("🧪 /api/warehouses-test called");
  res.json({
    success: true,
    message: "Warehouses test endpoint working",
    timestamp: new Date().toISOString(),
  });
});

// API documentation route
app.get("/api", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "BBM Backend API",
    version: "1.0.0",
    cors_enabled: true,
    deployed_on: "Vercel",
    endpoints: {
      warehouses: "/api/warehouse or /api/warehouses",
      zones: "/api/zones",
      cart: "/api/cart",
      products: "/api/productsroute",
      health: "/api/health",
      test_zones: "/api/zones-test",
      test_warehouses: "/api/warehouses-test",
    },
  });
});

// 404 handler for API routes
app.use("/api/*", (req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: "API endpoint not found",
    requested_path: req.originalUrl,
    method: req.method,
    available_endpoints: [
      "/api/warehouse",
      "/api/warehouses",
      "/api/zones",
      "/api/stock",
      "/api/cart",
      "/api/productsroute",
      "/api/location-search",
      "/api/health",
    ],
  });
});

// Error handling middleware for specific routes - removed array pattern
app.use("/api/zones", (error, req, res, next) => {
  console.error(`❌ Error in ${req.path}:`, error.message);

  // Ensure CORS headers are set for errors
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
  );
  res.header("Access-Control-Allow-Credentials", "true");

  res.status(500).json({
    success: false,
    error: "Route error",
    message: error.message,
    path: req.path,
  });
});

app.use("/api/warehouses", (error, req, res, next) => {
  console.error(`❌ Error in ${req.path}:`, error.message);

  // Ensure CORS headers are set for errors
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
  );
  res.header("Access-Control-Allow-Credentials", "true");

  res.status(500).json({
    success: false,
    error: "Route error",
    message: error.message,
    path: req.path,
  });
});

// Global error handler to ensure CORS headers
app.use((error, req, res, next) => {
  console.error("Global error handler:", error.message);

  // Ensure CORS headers are set for all errors
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name"
  );
  res.header("Access-Control-Allow-Credentials", "true");

  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: error.message,
  });
});

// Export for Vercel serverless
export default app;
