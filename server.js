import "./config/loadEnv.js";
import cluster from "cluster";
import os from "os";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import prisma, { connectPrisma, disconnectPrisma } from "./config/prisma.js";

import {
  startScheduledJobs,
  stopScheduledJobs,
} from "./services/scheduled-jobs.js";

import authRoutes from "./routes/authRoute.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import printRequestRoutes from "./routes/printRequestRoutes.js";
import geoAddressRoute from "./routes/geoAddressRoute.js";
import warehouseRoute from "./routes/warehouseRoute.js";
import productWarehouseRoute from "./routes/productWarehouseRoutes.js";
import productsRoute from "./routes/productRoutes.js";
import { getProductsCartData } from "./controller/productController.js";
import locationRoute from "./routes/locationRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import checkCartAvailabilityRoute from "./routes/checkCartAvailabilityRoute.js";
// import paymentRoutes from "./routes/paymentRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
// import bnbRoutes from "./routes/b&bRoutes.js";
// import bnbGroupRoutes from "./routes/b&bGroupRoutes.js";
// import bnbGroupProductRoutes from "./routes/b&bGroupProductRoutes.js";
import dailyDealsRoutes from "./routes/dailyDealsRoutes.js";
import dailyDealsProductRoutes from "./routes/dailyDealsProductRoutes.js";
import brandRoutes from "./routes/brandRoutes.js";
import brandProductsRoutes from "./routes/brandProducts.js";
import recommendedStoreRoutes from "./routes/recommendedStoreRoutes.js";
import quickPickRoutes from "./routes/quickPickRoutes.js";
import quickPickGroupRoutes from "./routes/quickPickGroupRoutes.js";
import quickPickGroupProductRoutes from "./routes/quickPickGroupProductRoutes.js";
import savingZoneRoutes from "./routes/savingZoneRoutes.js";
import storeRoutes from "./routes/storeRoute.js";
import subStoreRoutes from "./routes/subStoreRoute.js";
import YouMayLikeProductRoutes from "./routes/youMayLikeRoutes.js";
import addBannerRoutes from "./routes/addBannerRoutes.js";
// import addBannerGroupRoutes from "./routes/addBannerGroupRoutes.js";
// import addBannerGroupProductRoutes from "./routes/addBannerGroupProductRoutes.js";
import uniqueSectionRoutes from "./routes/uniqueSectionRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import returnOrderRoutes from "./routes/returnOrderRoutes.js";
import refundRoutes from "./routes/refundRoutes.js";
import debugRoutes from "./routes/debugRoutes.js";
import quickFixRoutes from "./routes/quickFixRoutes.js";
import trackingRoutes from "./routes/trackingRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import bulkOrderRoutes from "./routes/bulkOrderRoutes.js";
import bulkProductRoutes from "./routes/bulkProductRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import variantRoutes from "./routes/variantRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import videoCardRoutes from "./routes/videoCardRoutes.js";
import shopByStoreRoutes from "./routes/shopByStoreRoutes.js";
import productSectionRoutes from "./routes/productSectionRoutes.js";
import zoneRoutes from "./routes/zoneRoutes.js";
import promoBannerRoutes from "./routes/promoBannerRoutes.js";
import bulkWholesaleRoutes from "./routes/bulkWholesaleRoutes.js";
// import codOrderRoutes from "./routes/codOrderRoutes.js";
// import onlinePaymentOrderRoutes from "./routes/onlinePaymentOrderRoutes.js";
import walletOrderRoutes from "./routes/walletOrderRoutes.js";
import stockRoutes from "./routes/stockRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import adminProductRoutes from "./routes/adminProductRoutes.js";
import enquiriesRoutes from "./routes/enquiriesRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import adminWalletRoutes from "./routes/adminWalletRoutes.js";
import userAddressRoutes from "./routes/userAddressRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import customerTestimonialRoutes from "./routes/customerTestimonialRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import enquiryMessagesRoutes from "./routes/enquiryMessagesRoutes.js";
import bidRoutes from "./routes/bidRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import sectionMappingRoutes from "./routes/sectionMappingRoutes.js";
import smallPromoCardRoutes from "./routes/smallPromoCardRoutes.js";
import partnerRoutes from "./routes/partnerRoutes.js";
import certificationRoutes from "./routes/certificationRoutes.js";
import aboutContentRoutes from "./routes/aboutContentRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import teamMemberRoutes from "./routes/teamMemberRoutes.js";
import deliveryChargeRoutes from "./routes/deliveryChargeRoutes.js";
import chargeSettingsRoutes from "./routes/chargeSettingsRoutes.js";
import couponRoutes from "./routes/couponRoutes.js";
import adminUserRoutes from "./routes/adminUserRoutes.js";

// Configuration
const PORT = process.env.PORT || 8000;
const NUM_WORKERS = process.env.WORKERS || os.cpus().length;
const IS_CLUSTERED = process.env.CLUSTER_MODE !== "false"; // Enable clustering by default

// Get system information
const getSystemInfo = () => {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    platform: os.platform(),
    architecture: os.arch(),
    cpus: os.cpus().length,
    totalMemory: `${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    freeMemory: `${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    usedMemory: `${(usedMemory / 1024 / 1024 / 1024).toFixed(2)} GB`,
    memoryUsagePercent: `${((usedMemory / totalMemory) * 100).toFixed(2)}%`,
    loadAverage: os.loadavg(),
    uptime: `${(os.uptime() / 3600).toFixed(2)} hours`,
  };
};

// Create Express app
const createApp = () => {
  const app = express();

  // Middleware
  app.use(
    cors({
      origin: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      exposedHeaders: ["Authorization"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
        "Cache-Control",
        "X-File-Name",
        "X-Client-Info",
      ],
      credentials: true,
    }),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // API Routes
  app.use("/api/business", authRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/admin-auth", adminAuthRoutes);
  app.use("/api/print-requests", printRequestRoutes);
  app.use("/api/geo-address", geoAddressRoute);
  app.use("/api/warehouses", warehouseRoute);
  app.use("/api/productwarehouse", productWarehouseRoute);
  app.use("/api/productsroute", productsRoute);

  // Backwards-compatible batch endpoint used by older clients
  app.post("/api/products/cart-data", getProductsCartData);
  app.use("/api/locationsroute", locationRoute);
  app.use("/api/cart", cartRoutes);
  app.use("/api/order", orderRoutes);
  app.use("/api/orderItems", orderRoutes); // Now pointing to the same merged file
  app.use("/api/check", checkCartAvailabilityRoute);
  // app.use("/api/payment", paymentRoutes);
  app.use("/api/notifications", notificationRoutes);
  // app.use("/api/bnb", bnbRoutes);
  // app.use("/api/b&b-group", bnbGroupRoutes);
  // app.use("/api/b&b-group-product", bnbGroupProductRoutes);
  app.use("/api/daily-deals", dailyDealsRoutes);
  app.use("/api/daily-deals-product", dailyDealsProductRoutes);
  app.use("/api/brand", brandRoutes);
  app.use("/api/product-brand", brandProductsRoutes);
  app.use("/api/recommended-stores", recommendedStoreRoutes);
  app.use("/api/product-recommended-stores", recommendedStoreRoutes);
  app.use("/api/quick-pick", quickPickRoutes);
  app.use("/api/quick-pick-group", quickPickGroupRoutes);
  app.use("/api/quick-pick-group-product", quickPickGroupProductRoutes);
  app.use("/api/saving-zone", savingZoneRoutes);
  app.use("/api/saving-zone-group", savingZoneRoutes);
  app.use("/api/saving-zone-group-product", savingZoneRoutes);
  app.use("/api/stores", storeRoutes);
  app.use("/api/sub-stores", subStoreRoutes);
  app.use("/api/you-may-like-products", YouMayLikeProductRoutes);
  app.use("/api/add-banner", addBannerRoutes);
  app.use("/api/banner", addBannerRoutes);
  // app.use("/api/banner-groups", addBannerGroupRoutes);
  // app.use("/api/banner-group-products", addBannerGroupProductRoutes);
  app.use("/api/unique-sections", uniqueSectionRoutes);
  app.use("/api/unique-sections-products", uniqueSectionRoutes);
  app.use("/api/user", profileRoutes);
  app.use("/api/return-orders", returnOrderRoutes);
  app.use("/api/refund", refundRoutes);
  app.use("/api/debug", debugRoutes);
  app.use("/api/quick-fix", quickFixRoutes);
  app.use("/api/tracking", trackingRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/bulk-orders", bulkOrderRoutes);
  app.use("/api/bulk-products", bulkProductRoutes);
  app.use("/api/location", locationRoutes);
  app.use("/api/variants", variantRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/video-cards", videoCardRoutes);
  app.use("/api/shop-by-stores", shopByStoreRoutes);
  app.use("/api/product-sections", productSectionRoutes);
  app.use("/api/promo-banner", promoBannerRoutes);
  app.use("/api/store-section-mappings", subStoreRoutes);
  app.use("/api/small-promo-cards", smallPromoCardRoutes);
  app.use("/api/bulk-wholesale", bulkWholesaleRoutes);

  /*
  // COD Orders routes with logging middleware
  app.use(
    "/api/cod-orders",
    (req, res, next) => {
      console.log(`COD Orders API: ${req.method} ${req.originalUrl}`);
      console.log("Request Body:", req.body);
      next();
    },
    codOrderRoutes
  );
  */

  // Online Payment Orders (Razorpay, etc.) - No amount limit
  // app.use("/api/online-payment-orders", onlinePaymentOrderRoutes);

  // Wallet Orders (Prepaid via wallet balance)
  app.use("/api/wallet-orders", walletOrderRoutes);

  app.use("/api/zones", zoneRoutes);
  app.use("/api/stock", stockRoutes);
  app.use("/api/upload", uploadRoutes);
  app.use("/api/admin", adminProductRoutes);
  app.use("/api/admin/users", adminUserRoutes);

  app.use("/api/enquiries", enquiriesRoutes);
  app.use("/api/wallet", walletRoutes);
  app.use("/api/admin/wallets", adminWalletRoutes);
  app.use("/api/user/addresses", userAddressRoutes);
  app.use("/api/reviews", reviewRoutes);
  app.use("/api/customer-testimonials", customerTestimonialRoutes);
  app.use("/api/wishlist", wishlistRoutes);
  app.use("/api/enquiry-messages", enquiryMessagesRoutes);
  app.use("/api/bids", bidRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/section-mappings", sectionMappingRoutes);
  app.use("/api/partners", partnerRoutes);
  app.use("/api/certifications", certificationRoutes);
  app.use("/api/about-content", aboutContentRoutes);
  app.use("/api/contact", contactRoutes);
  app.use("/api/team-members", teamMemberRoutes);
  app.use("/api/delivery-charges", deliveryChargeRoutes);
  app.use("/api/charge-settings", chargeSettingsRoutes);
  app.use("/api/scheduled-orders", orderRoutes);
  app.use("/api/coupons", couponRoutes);

  // Enhanced health check with cluster and system info
  app.get("/api/health", (req, res) => {
    const systemInfo = getSystemInfo();
    const processMemory = process.memoryUsage();

    res.status(200).json({
      status: "OK",
      message: "Server is healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      cluster: {
        isMaster: cluster.isPrimary,
        workerId: cluster.worker?.id || "primary",
        totalWorkers: IS_CLUSTERED ? NUM_WORKERS : 1,
      },
      system: systemInfo,
      process: {
        pid: process.pid,
        uptime: `${(process.uptime() / 3600).toFixed(2)} hours`,
        memory: {
          rss: `${(processMemory.rss / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(processMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(processMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          external: `${(processMemory.external / 1024 / 1024).toFixed(2)} MB`,
        },
      },
    });
  });

  // Debug helper: show mounted routes (development only)
  app.get("/__routes", (req, res) => {
    try {
      const routes = [];
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          routes.push(middleware.route.path);
        } else if (middleware.name === "router") {
          middleware.handle.stack.forEach(function (handler) {
            const route = handler.route;
            route && routes.push(route.path);
          });
        }
      });
      res.json({
        success: true,
        routes,
        workerId: cluster.worker?.id || "primary",
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // System metrics endpoint
  app.get("/api/metrics", (req, res) => {
    const systemInfo = getSystemInfo();
    const processMemory = process.memoryUsage();

    res.status(200).json({
      timestamp: new Date().toISOString(),
      system: systemInfo,
      process: {
        pid: process.pid,
        workerId: cluster.worker?.id || "primary",
        uptime: process.uptime(),
        memory: processMemory,
        cpuUsage: process.cpuUsage(),
      },
    });
  });

  return app;
};

// Validate critical environment variables
const validateEnv = () => {
  const requiredEnvVars = [
    "JWT_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );

  if (missingEnvVars.length > 0) {
    console.error(
      "❌ Missing required environment variables:",
      missingEnvVars.join(", "),
    );
    console.error("⚠️  Server may not function correctly!");
    return false;
  } else {
    console.log("✅ All required environment variables are set");
    return true;
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (server, signal) => {
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

  // Stop accepting new requests
  server.close(() => {
    console.log("✅ HTTP server closed");
  });

  // Stop scheduled jobs
  try {
    stopScheduledJobs();
    console.log("✅ Scheduled jobs stopped");
  } catch (error) {
    console.error("⚠️  Error stopping scheduled jobs:", error);
  }

  // Disconnect Prisma
  try {
    await disconnectPrisma();
  } catch (error) {
    console.error("⚠️  Error disconnecting Prisma:", error);
  }

  // Give ongoing requests time to complete
  setTimeout(() => {
    console.log("⏱️  Forcing shutdown after timeout");
    process.exit(0);
  }, 10000); // 10 second timeout
};

/*
// Master process - manages worker processes
if (IS_CLUSTERED && cluster.isPrimary) {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          AWS CLUSTERED SERVER - MASTER PROCESS             ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`🖥️  Master process ${process.pid} is running`);
  console.log(`📊 System Info:`);

  const sysInfo = getSystemInfo();
  console.log(`   Platform: ${sysInfo.platform} (${sysInfo.architecture})`);
  console.log(`   CPUs: ${sysInfo.cpus} cores`);
  console.log(`   Total Memory: ${sysInfo.totalMemory}`);
  console.log(`   Free Memory: ${sysInfo.freeMemory}`);
  console.log(`   Memory Usage: ${sysInfo.memoryUsagePercent}`);
  console.log(
    `   Load Average: ${sysInfo.loadAverage
      .map((l) => l.toFixed(2))
      .join(", ")}`
  );
  console.log(`\n🔧 Spawning ${NUM_WORKERS} worker processes...`);

  // Validate environment before spawning workers
  validateEnv();

  // Fork workers
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  // Worker event handlers
  cluster.on("online", (worker) => {
    console.log(`✅ Worker ${worker.process.pid} (ID: ${worker.id}) is online`);
  });

  cluster.on("exit", (worker, code, signal) => {
    console.log(
      `⚠️  Worker ${worker.process.pid} (ID: ${worker.id}) died (${signal || code
      })`
    );

    // Restart the worker
    console.log("🔄 Starting a new worker...");
    cluster.fork();
  });

  // Handle master process signals
  process.on("SIGTERM", () => {
    console.log("\n🛑 SIGTERM received in master process");
    console.log("📢 Shutting down all workers...");

    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }

    setTimeout(() => {
      console.log("👋 Master process exiting");
      process.exit(0);
    }, 5000);
  });

  process.on("SIGINT", () => {
    console.log("\n🛑 SIGINT received in master process");
    console.log("📢 Shutting down all workers...");

    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }

    setTimeout(() => {
      console.log("👋 Master process exiting");
      process.exit(0);
    }, 5000);
  });
} else {
  // Worker process - runs the actual server
  const app = createApp();

  // Initialize Prisma connection before starting server
  connectPrisma()
    .then(() => {
      const server = app.listen(PORT, () => {
        const workerId = cluster.worker?.id || "standalone";
        const pid = process.pid;

        console.log(
          "\n╔════════════════════════════════════════════════════════════╗"
        );
        console.log(
          `║  🚀 Worker ${workerId} (PID: ${pid}) - Server Started on Port ${PORT}  ║`
        );
        console.log(
          "╚════════════════════════════════════════════════════════════╝"
        );
        console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`🌐 CORS: Configured to allow all origins`);
        console.log(
          `💳 Razorpay Mode: ${process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ? "TEST" : "LIVE"
          }`
        );
        console.log(
          `🔗 Supabase: Storage & Auth only`
        );
        console.log(`🔧 Cluster Mode: ${IS_CLUSTERED ? "ENABLED" : "DISABLED"}`);
        console.log(
          "════════════════════════════════════════════════════════════\n"
        );

        // Start scheduled jobs (only in first worker or standalone mode)
        // if (!IS_CLUSTERED || workerId === 1) {
        //   startScheduledJobs();
        // }
      });

      // Graceful shutdown for workers
      process.on("SIGTERM", () => gracefulShutdown(server, "SIGTERM"));
      process.on("SIGINT", () => gracefulShutdown(server, "SIGINT"));

      // Handle uncaught exceptions
      process.on("uncaughtException", (error) => {
        console.error("❌ Uncaught Exception:", error);
        gracefulShutdown(server, "UNCAUGHT_EXCEPTION");
      });

      // Handle unhandled promise rejections
      process.on("unhandledRejection", (reason, promise) => {
        console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
      });
    })
    .catch((error) => {
      console.error("❌ Failed to start server due to Prisma connection error");
      process.exit(1);
    });
}
*/

// Worker process - runs the actual server
const app = createApp();

// Initialize Prisma connection before starting server (skip if SKIP_DB is set)
const startServer = async () => {
  if (process.env.SKIP_DB !== "true") {
    await connectPrisma();
  } else {
    console.log("⚠️ Skipping database connection (SKIP_DB=true)");
  }

  const server = app.listen(PORT, () => {
    const workerId = "standalone";
    const pid = process.pid;

    console.log(
      "\n╔════════════════════════════════════════════════════════════╗",
    );
    console.log(
      `║  🚀 Worker ${workerId} (PID: ${pid}) - Server Started on Port ${PORT}  ║`,
    );
    console.log(
      "╚════════════════════════════════════════════════════════════╝",
    );
    console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🌐 CORS: Configured to allow all origins`);
    console.log(
      `💳 Razorpay Mode: ${
        process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ? "TEST" : "LIVE"
      }`,
    );
    console.log(`🔗 Supabase: Storage & Auth only`);
    console.log(`🔧 Cluster Mode: DISABLED`);
    console.log(
      `🗄️ Database: ${process.env.SKIP_DB === "true" ? "SKIPPED" : "CONNECTED"}`,
    );
    console.log(
      "════════════════════════════════════════════════════════════\n",
    );

    // Start scheduled jobs (only in first worker or standalone mode)
    // if (!IS_CLUSTERED || workerId === 1) {
    //   startScheduledJobs();
    // }
  });

  // Graceful shutdown for workers
  process.on("SIGTERM", () => gracefulShutdown(server, "SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown(server, "SIGINT"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    gracefulShutdown(server, "UNCAUGHT_EXCEPTION");
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  });
};

startServer().catch((error) => {
  console.error("❌ Failed to start server:", error.message);
  process.exit(1);
});

// Export the app for testing or other purposes
export default createApp();
