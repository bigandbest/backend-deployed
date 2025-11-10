import express from "express";
import multer from "multer";
import {
  uploadZonePincodes,
  getAllZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  validatePincode,
  downloadSampleExcel,
  getZoneStatistics,
} from "../controller/zoneController.js";

const router = express.Router();

// Configure multer for Excel file uploads (with CSV fallback)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept Excel files (with CSV fallback)
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv",
      "application/csv",
    ];
    const allowedExtensions = [".xlsx", ".xls", ".csv"];

    const hasValidMime = allowedMimes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some((ext) =>
      file.originalname.toLowerCase().endsWith(ext)
    );

    if (hasValidMime || hasValidExtension) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only Excel (.xlsx, .xls) files are allowed (CSV supported for compatibility)"
        ),
        false
      );
    }
  },
});

// File Upload Operations
router.post("/upload", upload.single("csv_file"), uploadZonePincodes);
router.get("/sample-excel", downloadSampleExcel);
router.get("/sample-csv", downloadSampleExcel); // Backward compatibility

// Zone CRUD Operations
router.get("/statistics", getZoneStatistics);
router.get("/", getAllZones);
router.get("/:id", getZoneById);
router.post("/", createZone);
router.put("/:id", updateZone);
router.delete("/:id", deleteZone);

// Delivery Validation
router.post("/validate-pincode", validatePincode);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  // Ensure CORS headers are set for error responses
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

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        error: "File too large",
        message: "File size should not exceed 10MB",
      });
    }
  }

  if (error.message.includes("Only Excel")) {
    return res.status(400).json({
      success: false,
      error: "Invalid file type",
      message: "Only Excel files are allowed (CSV supported for compatibility)",
    });
  }

  next(error);
});

export default router;
