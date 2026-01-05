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
            district: row[2] ? row[2].toString().trim() : null,
            location_name: row[3] ? row[3].toString().trim() : null,
            village: row[4] ? row[4].toString().trim() : null,
            city: row[5] ? row[5].toString().trim() : null,
            state: row[6] ? row[6].toString().trim() : null,
            others: row[7] ? row[7].toString().trim() : null,
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
            district: values[2] || null,
            location_name: values[3] || null,
            village: values[4] || null,
            city: values[5] || null,
            state: values[6] || null,
            others: values[7] || null,
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
    ["zone_name", "pincode", "district", "location_name", "village", "city", "state", "others"],
    ["DelhiZone", "110001", "Central Delhi", "Connaught Place", "", "New Delhi", "Delhi", "Commercial Hub"],
    ["DelhiZone", "110002", "South West Delhi", "Cantonment Area", "", "Delhi Cantt", "Delhi", "Military Area"],
    ["DelhiZone", "110003", "Central Delhi", "GPO", "", "New Delhi GPO", "Delhi", "Government Office"],
    ["DelhiZone", "122001", "Gurgaon", "Sector 1", "", "Gurgaon", "Haryana", "Residential"],
    ["DelhiZone", "122002", "Gurgaon", "Sector 14", "", "Sector 14 Gurgaon", "Haryana", "Residential"],
    ["MumbaiZone", "400001", "Mumbai City", "Fort Area", "", "Fort Mumbai", "Maharashtra", "Business District"],
    ["MumbaiZone", "400002", "Mumbai City", "Kalbadevi", "", "Kalbadevi", "Maharashtra", "Market Area"],
    ["MumbaiZone", "400003", "Mumbai City", "GPO", "", "Mumbai GPO", "Maharashtra", "Post Office"],
    ["MumbaiZone", "400004", "Mumbai City", "Girgaon", "", "Girgaon", "Maharashtra", "Residential"],
    ["ChennaiZone", "600001", "Chennai", "GPO", "", "Chennai GPO", "Tamil Nadu", "Central"],
    ["ChennaiZone", "600002", "Chennai", "Anna Salai", "", "Anna Salai", "Tamil Nadu", "Commercial"],
    ["ChennaiZone", "600003", "Chennai", "Egmore", "", "Egmore", "Tamil Nadu", "Residential"],
    ["BangaloreZone", "560001", "Bangalore Urban", "GPO", "", "Bangalore GPO", "Karnataka", "Central"],
    ["BangaloreZone", "560002", "Bangalore Urban", "East Zone", "", "Bangalore East", "Karnataka", "Industrial"],
    ["BangaloreZone", "560003", "Bangalore Urban", "Malleswaram", "", "Malleswaram", "Karnataka", "Residential"],
    ["PuneZone", "411001", "Pune", "Camp Area", "", "Pune Camp", "Maharashtra", "Commercial"],
    ["PuneZone", "411002", "Pune", "Cantonment", "", "Pune Cantt", "Maharashtra", "Military"],
    ["HyderabadZone", "500001", "Hyderabad", "GPO", "", "Hyderabad GPO", "Telangana", "Central"],
    ["HyderabadZone", "500003", "Hyderabad", "Secunderabad", "", "Secunderabad", "Telangana", "Residential"],
  ];

  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Create worksheet from data
  const worksheet = XLSX.utils.aoa_to_sheet(sampleData);

  // Set column widths for better readability
  worksheet["!cols"] = [
    { width: 15 }, // zone_name
    { width: 10 }, // pincode
    { width: 18 }, // district
    { width: 20 }, // location_name
    { width: 15 }, // village
    { width: 20 }, // city
    { width: 15 }, // state
    { width: 20 }, // others
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
