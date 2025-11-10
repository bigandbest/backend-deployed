import XLSX from "xlsx";
import { Readable } from "stream";
import csv from "csv-parser";

/**
 * Parse Excel file buffer and validate data
 * @param {Buffer} fileBuffer - The Excel file buffer
 * @param {Array} requiredColumns - Array of required column names
 * @returns {Promise<Array>} - Parsed and validated Excel data
 */
export const parseExcel = (
  fileBuffer,
  requiredColumns = ["zone_name", "pincode"]
) => {
  return new Promise((resolve, reject) => {
    try {
      // Read the Excel file
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });

      // Get the first worksheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        reject(new Error("Excel file contains no worksheets"));
        return;
      }

      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON with headers
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1, // Use first row as headers, but we'll handle manually
        defval: "",
      });

      if (jsonData.length === 0) {
        reject(new Error("Excel file is empty"));
        return;
      }

      const results = [];
      const errors = [];

      // Determine if the first row is a header row
      const firstRow = jsonData[0] || [];
      const lowerFirstRow = firstRow.map((c) =>
        typeof c === "string" ? c.toString().trim().toLowerCase() : ""
      );

      const hasHeader =
        lowerFirstRow.includes("zone_name") &&
        lowerFirstRow.includes("pincode");

      const startIndex = hasHeader ? 1 : 0;

      // Process each row starting from determined index
      for (let i = startIndex; i < jsonData.length; i++) {
        const row = jsonData[i] || [];
        const zone_name =
          row[0] !== undefined && row[0] !== null
            ? row[0].toString().trim()
            : "";
        const pincode =
          row[1] !== undefined && row[1] !== null
            ? row[1].toString().trim()
            : "";

        try {
          // Validate required columns exist
          if (!zone_name || zone_name === "" || !pincode || pincode === "") {
            errors.push({
              row: i + 1, // Excel rows are 1-indexed
              error: `Missing required columns: zone_name, pincode`,
              data: { _0: row[0], _1: row[1], _2: row[2], _3: row[3] },
            });
            continue;
          }

          // Validate pincode format (should be 6 digits)
          if (!/^\d{6}$/.test(pincode)) {
            errors.push({
              row: i + 1,
              error: `Invalid pincode format: ${pincode}. Should be 6 digits.`,
              data: { _0: row[0], _1: row[1], _2: row[2], _3: row[3] },
            });
            continue;
          }

          // Clean and format the data
          const cleanedRow = {
            zone_name: zone_name,
            pincode: pincode,
            city: row[2] ? row[2].toString().trim() : null,
            state: row[3] ? row[3].toString().trim() : null,
          };

          results.push(cleanedRow);
        } catch (error) {
          errors.push({
            row: i + 1,
            error: `Row parsing error: ${error.message}`,
            data: { _0: row[0], _1: row[1], _2: row[2], _3: row[3] },
          });
        }
      }

      resolve({
        data: results,
        errors: errors,
        totalRows: results.length + errors.length,
        validRows: results.length,
        errorRows: errors.length,
      });
    } catch (error) {
      reject(new Error(`Excel parsing failed: ${error.message}`));
    }
  });
};

// Fallback CSV parser using csv-parser (handles plain .csv uploads)
export const parseCSVText = (
  fileBuffer,
  requiredColumns = ["zone_name", "pincode"]
) => {
  return new Promise((resolve, reject) => {
    const results = [];
    const errors = [];

    // Strip BOM if present
    let buffer = fileBuffer;
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    ) {
      buffer = buffer.slice(3);
    }

    const readable = Readable.from(buffer.toString("utf8"));

    readable
      .pipe(
        csv({
          skipLines: 0,
          trim: true,
        })
      )
      .on("data", (row) => {
        try {
          // csv-parser will map headers to keys if present, otherwise numeric keys
          const values = Object.values(row);
          const zone_name = values[0] ? values[0].toString().trim() : "";
          const pincode = values[1] ? values[1].toString().trim() : "";

          if (!zone_name || !pincode) {
            errors.push({
              row: null,
              error: `Missing required columns: zone_name, pincode`,
              data: row,
            });
            return;
          }

          if (!/^\d{6}$/.test(pincode)) {
            errors.push({
              row: null,
              error: `Invalid pincode format: ${pincode}. Should be 6 digits.`,
              data: row,
            });
            return;
          }

          results.push({
            zone_name,
            pincode,
            city: values[2] || null,
            state: values[3] || null,
          });
        } catch (err) {
          errors.push({
            row: null,
            error: `Row parsing error: ${err.message}`,
            data: row,
          });
        }
      })
      .on("end", () => {
        resolve({
          data: results,
          errors,
          totalRows: results.length + errors.length,
          validRows: results.length,
          errorRows: errors.length,
        });
      })
      .on("error", (err) =>
        reject(new Error(`CSV parsing failed: ${err.message}`))
      );
  });
};

/**
 * Validate zone names for database insertion
 * @param {Array} zones - Array of zone names
 * @returns {Object} - Validation result
 */
export const validateZoneNames = (zones) => {
  const errors = [];
  const validZones = [];

  zones.forEach((zoneName) => {
    // Check length
    if (zoneName.length > 100) {
      errors.push(`Zone name too long: ${zoneName.substring(0, 50)}...`);
      return;
    }

    // Check for valid characters (alphanumeric, spaces, hyphens, underscores)
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(zoneName)) {
      errors.push(`Invalid characters in zone name: ${zoneName}`);
      return;
    }

    // Check for reserved names
    const reservedNames = ["nationwide", "all", "global", "admin", "system"];
    if (reservedNames.includes(zoneName.toLowerCase())) {
      errors.push(`Reserved zone name not allowed: ${zoneName}`);
      return;
    }

    validZones.push(zoneName);
  });

  return {
    validZones,
    errors,
    isValid: errors.length === 0,
  };
};

/**
 * Group Excel data by zones
 * @param {Array} excelData - Parsed Excel data
 * @returns {Object} - Data grouped by zones
 */
export const groupByZones = (excelData) => {
  const zoneGroups = {};

  excelData.forEach((row) => {
    if (!zoneGroups[row.zone_name]) {
      zoneGroups[row.zone_name] = [];
    }

    zoneGroups[row.zone_name].push({
      pincode: row.pincode,
      city: row.city,
      state: row.state,
    });
  });

  return zoneGroups;
};

/**
 * Validate file type and size
 * @param {Object} file - Multer file object
 * @returns {Object} - Validation result
 */
export const validateFile = (file) => {
  const errors = [];

  // Check file exists
  if (!file) {
    errors.push("No file uploaded");
    return { isValid: false, errors };
  }

  // Check file type
  const allowedMimes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
  ];
  const allowedExtensions = [".xlsx", ".xls", ".csv"];

  const hasValidMime = allowedMimes.includes(file.mimetype);
  const hasValidExtension = allowedExtensions.some((ext) =>
    file.originalname.toLowerCase().endsWith(ext)
  );

  if (!hasValidMime && !hasValidExtension) {
    errors.push(
      "Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed."
    );
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  if (file.size > maxSize) {
    errors.push("File too large. Maximum size allowed is 10MB.");
  }

  // Check if file is empty
  if (file.size === 0) {
    errors.push("File is empty.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Generate sample Excel content for download
 * @returns {Buffer} - Excel file buffer
 */
export const generateSampleExcel = () => {
  const sampleData = [
    ["zone_name", "pincode", "city", "state"],
    ["DelhiZone", "110001", "New Delhi", "Delhi"],
    ["DelhiZone", "110002", "Delhi Cantt", "Delhi"],
    ["DelhiZone", "110003", "New Delhi GPO", "Delhi"],
    ["DelhiZone", "122001", "Gurgaon", "Haryana"],
    ["DelhiZone", "122002", "Sector 14 Gurgaon", "Haryana"],
    ["MumbaiZone", "400001", "Fort Mumbai", "Maharashtra"],
    ["MumbaiZone", "400002", "Kalbadevi", "Maharashtra"],
    ["MumbaiZone", "400003", "Mumbai GPO", "Maharashtra"],
    ["MumbaiZone", "400004", "Girgaon", "Maharashtra"],
    ["ChennaiZone", "600001", "Chennai GPO", "Tamil Nadu"],
    ["ChennaiZone", "600002", "Anna Salai", "Tamil Nadu"],
    ["ChennaiZone", "600003", "Egmore", "Tamil Nadu"],
    ["BangaloreZone", "560001", "Bangalore GPO", "Karnataka"],
    ["BangaloreZone", "560002", "Bangalore East", "Karnataka"],
    ["BangaloreZone", "560003", "Malleswaram", "Karnataka"],
    ["PuneZone", "411001", "Pune Camp", "Maharashtra"],
    ["PuneZone", "411002", "Pune Cantt", "Maharashtra"],
    ["HyderabadZone", "500001", "Hyderabad GPO", "Telangana"],
    ["HyderabadZone", "500003", "Secunderabad", "Telangana"],
  ];

  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Create worksheet from data
  const worksheet = XLSX.utils.aoa_to_sheet(sampleData);

  // Set column widths for better readability
  worksheet["!cols"] = [
    { width: 15 }, // zone_name
    { width: 10 }, // pincode
    { width: 20 }, // city
    { width: 15 }, // state
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, "Zone Pincodes");

  // Write to buffer
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
};

export default {
  parseExcel,
  parseCSVText,
  validateZoneNames,
  groupByZones,
  validateFile,
  generateSampleExcel,
};
