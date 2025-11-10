import { supabase } from "../config/supabaseClient.js";
import {
  parseExcel,
  parseCSVText,
  validateZoneNames,
  groupByZones,
  validateFile,
  generateSampleExcel,
} from "../utils/excelParser.js";

/**
 * Upload zones and pincodes from Excel file
 */
export const uploadZonePincodes = async (req, res) => {
  try {
    const file = req.file;

    // Validate file
    const fileValidation = validateFile(file);
    if (!fileValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "File validation failed",
        details: fileValidation.errors,
      });
    }

    // Parse file (Excel or CSV)
    const isCsv =
      file.originalname && file.originalname.toLowerCase().endsWith(".csv");
    let parseResult;
    if (isCsv) {
      // Use CSV text parser for plain CSV files
      parseResult = await parseCSVText(file.buffer, ["zone_name", "pincode"]);
    } else {
      // Use Excel parser for .xlsx/.xls
      parseResult = await parseExcel(file.buffer, ["zone_name", "pincode"]);
    }

    if (parseResult.errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "File parsing failed",
        details: parseResult.errors,
        summary: {
          totalRows: parseResult.totalRows,
          validRows: parseResult.validRows,
          errorRows: parseResult.errorRows,
        },
      });
    }

    // Group data by zones
    const zoneGroups = groupByZones(parseResult.data);
    const zoneNames = Object.keys(zoneGroups);

    // Validate zone names
    const zoneValidation = validateZoneNames(zoneNames);
    if (!zoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Zone validation failed",
        details: zoneValidation.errors,
      });
    }

    // Start transaction
    const uploadResults = {
      zonesCreated: 0,
      zonesUpdated: 0,
      pincodesCreated: 0,
      pincodesUpdated: 0,
      errors: [],
    };

    for (const [zoneName, pincodes] of Object.entries(zoneGroups)) {
      try {
        // Create or get zone
        const { data: existingZone } = await supabase
          .from("delivery_zones")
          .select("id")
          .eq("name", zoneName)
          .single();

        let zoneId;
        if (existingZone) {
          zoneId = existingZone.id;
          uploadResults.zonesUpdated++;
        } else {
          const { data: newZone, error: zoneError } = await supabase
            .from("delivery_zones")
            .insert({
              name: zoneName,
              display_name: zoneName.replace(/([A-Z])/g, " $1").trim(),
              is_nationwide: false,
              is_active: true,
              description: `Zone created from Excel upload on ${new Date().toISOString()}`,
            })
            .select("id")
            .single();

          if (zoneError) {
            uploadResults.errors.push(
              `Failed to create zone ${zoneName}: ${zoneError.message}`
            );
            continue;
          }

          zoneId = newZone.id;
          uploadResults.zonesCreated++;
        }

        // Process pincodes for this zone
        for (const pincodeData of pincodes) {
          try {
            // Check if pincode already exists in this zone
            const { data: existingPincode } = await supabase
              .from("zone_pincodes")
              .select("id")
              .eq("zone_id", zoneId)
              .eq("pincode", pincodeData.pincode)
              .single();

            if (existingPincode) {
              // Update existing pincode
              const { error: updateError } = await supabase
                .from("zone_pincodes")
                .update({
                  city: pincodeData.city,
                  state: pincodeData.state,
                  is_active: true,
                })
                .eq("id", existingPincode.id);

              if (updateError) {
                uploadResults.errors.push(
                  `Failed to update pincode ${pincodeData.pincode}: ${updateError.message}`
                );
              } else {
                uploadResults.pincodesUpdated++;
              }
            } else {
              // Create new pincode
              const { error: pincodeError } = await supabase
                .from("zone_pincodes")
                .insert({
                  zone_id: zoneId,
                  pincode: pincodeData.pincode,
                  city: pincodeData.city,
                  state: pincodeData.state,
                  is_active: true,
                });

              if (pincodeError) {
                uploadResults.errors.push(
                  `Failed to create pincode ${pincodeData.pincode}: ${pincodeError.message}`
                );
              } else {
                uploadResults.pincodesCreated++;
              }
            }
          } catch (pincodeError) {
            uploadResults.errors.push(
              `Error processing pincode ${pincodeData.pincode}: ${pincodeError.message}`
            );
          }
        }
      } catch (zoneError) {
        uploadResults.errors.push(
          `Error processing zone ${zoneName}: ${zoneError.message}`
        );
      }
    }

    res.status(200).json({
      success: true,
      message: "Excel upload completed",
      results: uploadResults,
      summary: {
        totalZones: Object.keys(zoneGroups).length,
        totalPincodes: parseResult.validRows,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      success: false,
      error: "Upload failed",
      message: error.message,
    });
  }
};

/**
 * Get all zones with statistics
 */
export const getAllZones = async (req, res) => {
  console.log("getAllZones called");
  try {
    const {
      page = 1,
      limit = 50,
      search = "",
      active_only = "false",
    } = req.query;

    console.log("Query params:", { page, limit, search, active_only });

    const offset = (page - 1) * limit;

    // Check if supabase is available
    if (!supabase) {
      console.error("Supabase client not available");
      return res.status(500).json({
        success: false,
        error: "Database connection not available",
      });
    }

    console.log("Building query...");

    // For warehouse management, we need delivery zones with state info
    // Get delivery zones with their associated states from zone_pincodes
    let query = supabase.from("delivery_zones").select(
      `
        id,
        name,
        display_name,
        is_nationwide,
        is_active,
        description,
        created_at,
        zone_pincodes(pincode, city, state)
      `,
      { count: "exact" }
    );

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    if (active_only === "true") {
      query = query.eq("is_active", true);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    console.log("Executing database query...");
    const { data, error, count } = await query;

    console.log("Database response:", {
      dataCount: data?.length,
      error: error?.message,
      totalCount: count,
    });

    if (error) {
      console.error("Database error details:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
        details: error,
      });
    }

    // Transform data to include a representative state for each zone
    const transformedData =
      data?.map((zone) => {
        // Get unique states for this zone
        const pincodes = zone.zone_pincodes || [];
        const states = [
          ...new Set(pincodes.map((zp) => zp.state).filter(Boolean) || []),
        ];
        const representativeState =
          states.length > 0 ? states[0] : "Multiple States";

        return {
          id: zone.id,
          name: zone.display_name || zone.name,
          display_name: zone.display_name,
          state: states.length === 1 ? states[0] : "Multiple States",
          is_nationwide: zone.is_nationwide,
          is_active: zone.is_active,
          description: zone.description,
          pincode_count: pincodes.length,
          states: states, // Include all states for reference
          created_at: zone.created_at,
        };
      }) || [];

    console.log("Sending response with", transformedData.length, "zones");
    res.status(200).json({
      success: true,
      data: transformedData,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get zones error:", error);

    // Send a more detailed error response
    res.status(500).json({
      success: false,
      error: "Failed to fetch zones",
      message: error.message,
      details: error,
      code: error.code || "UNKNOWN_ERROR",
      hint: "Please check your database connection and try again",
      statusCode: 500,
    });
  }
};

/**
 * Get zone by ID with pincodes
 */
export const getZoneById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get zone details
    const { data: zone, error: zoneError } = await supabase
      .from("delivery_zones")
      .select("*")
      .eq("id", id)
      .single();

    if (zoneError || !zone) {
      return res.status(404).json({
        success: false,
        error: "Zone not found",
      });
    }

    // Get pincodes for this zone
    let pincodes = [];
    if (!zone.is_nationwide) {
      const { data: pincodeData, error: pincodeError } = await supabase
        .from("zone_pincodes")
        .select("*")
        .eq("zone_id", id)
        .order("pincode");

      if (pincodeError) {
        return res.status(500).json({
          success: false,
          error: "Failed to fetch pincodes",
        });
      }

      pincodes = pincodeData;
    }

    res.status(200).json({
      success: true,
      zone: {
        ...zone,
        pincodes,
      },
    });
  } catch (error) {
    console.error("Get zone by ID error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch zone",
      message: error.message,
    });
  }
};

/**
 * Create new zone
 */
export const createZone = async (req, res) => {
  try {
    const { name, display_name, description, is_nationwide = false } = req.body;

    if (!name || !display_name) {
      return res.status(400).json({
        success: false,
        error: "Name and display name are required",
      });
    }

    // Validate zone name
    const zoneValidation = validateZoneNames([name]);
    if (!zoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid zone name",
        details: zoneValidation.errors,
      });
    }

    const { data, error } = await supabase
      .from("delivery_zones")
      .insert({
        name,
        display_name,
        description,
        is_nationwide,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(201).json({
      success: true,
      zone: data,
      message: "Zone created successfully",
    });
  } catch (error) {
    console.error("Create zone error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create zone",
      message: error.message,
    });
  }
};

/**
 * Update zone
 */
export const updateZone = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, display_name, description, is_nationwide, is_active } =
      req.body;

    // Validate zone name if provided
    if (name) {
      const zoneValidation = validateZoneNames([name]);
      if (!zoneValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: "Invalid zone name",
          details: zoneValidation.errors,
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (display_name !== undefined) updateData.display_name = display_name;
    if (description !== undefined) updateData.description = description;
    if (is_nationwide !== undefined) updateData.is_nationwide = is_nationwide;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from("delivery_zones")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Zone not found",
      });
    }

    res.status(200).json({
      success: true,
      zone: data,
      message: "Zone updated successfully",
    });
  } catch (error) {
    console.error("Update zone error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update zone",
      message: error.message,
    });
  }
};

/**
 * Delete zone
 */
export const deleteZone = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if zone is used by any products
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .contains("allowed_zone_ids", [parseInt(id)])
      .limit(5);

    if (productError) {
      return res.status(500).json({
        success: false,
        error: "Failed to check zone usage",
      });
    }

    if (products && products.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete zone",
        message: `Zone is currently used by ${products.length} product(s)`,
        products: products.map((p) => ({ id: p.id, name: p.name })),
      });
    }

    // Delete zone (CASCADE will delete associated pincodes)
    const { error } = await supabase
      .from("delivery_zones")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(200).json({
      success: true,
      message: "Zone deleted successfully",
    });
  } catch (error) {
    console.error("Delete zone error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete zone",
      message: error.message,
    });
  }
};

/**
 * Validate pincode for delivery
 */
export const validatePincode = async (req, res) => {
  try {
    const { pincode, product_ids = [] } = req.body;

    if (!pincode) {
      return res.status(400).json({
        success: false,
        error: "Pincode is required",
      });
    }

    // Validate pincode format
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: "Invalid pincode format",
      });
    }

    // Get zones for this pincode
    const { data: zones, error: zoneError } = await supabase.rpc(
      "get_zones_for_pincode",
      { target_pincode: pincode }
    );

    if (zoneError) {
      return res.status(500).json({
        success: false,
        error: "Failed to validate pincode",
      });
    }

    // Check product delivery availability if product_ids provided
    const productResults = {};
    if (product_ids.length > 0) {
      for (const productId of product_ids) {
        const { data: canDeliver, error } = await supabase.rpc(
          "can_deliver_to_pincode",
          {
            product_id: parseInt(productId),
            target_pincode: pincode,
          }
        );

        if (!error) {
          productResults[productId] = canDeliver;
        }
      }
    }

    res.status(200).json({
      success: true,
      pincode,
      zones: zones || [],
      product_availability: productResults,
      can_deliver: zones && zones.length > 0,
    });
  } catch (error) {
    console.error("Validate pincode error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to validate pincode",
      message: error.message,
    });
  }
};

/**
 * Download sample Excel
 */
export const downloadSampleExcel = async (req, res) => {
  try {
    const excelBuffer = generateSampleExcel();

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="zone_pincodes_sample.xlsx"'
    );
    res.status(200).send(excelBuffer);
  } catch (error) {
    console.error("Download sample Excel error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate sample Excel",
      message: error.message,
    });
  }
};

/**
 * Get zone statistics dashboard
 */
export const getZoneStatistics = async (req, res) => {
  try {
    // Get total zones
    const { count: totalZones } = await supabase
      .from("delivery_zones")
      .select("*", { count: "exact", head: true });

    // Get active zones
    const { count: activeZones } = await supabase
      .from("delivery_zones")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    // Get total pincodes
    const { count: totalPincodes } = await supabase
      .from("zone_pincodes")
      .select("*", { count: "exact", head: true });

    // Get products using zonal delivery
    const { count: zonalProducts } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("delivery_type", "zonal");

    // Get top zones by pincode count
    const { data: topZones } = await supabase
      .from("zone_stats")
      .select("*")
      .eq("is_active", true)
      .not("is_nationwide", "eq", true)
      .order("pincode_count", { ascending: false })
      .limit(5);

    res.status(200).json({
      success: true,
      statistics: {
        totalZones,
        activeZones,
        totalPincodes,
        zonalProducts,
        nationwideProducts: await getNationwideProductCount(),
        topZones: topZones || [],
      },
    });
  } catch (error) {
    console.error("Get zone statistics error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
      message: error.message,
    });
  }
};

// Helper function to get nationwide product count
const getNationwideProductCount = async () => {
  try {
    const { count } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("delivery_type", "nationwide");
    return count || 0;
  } catch {
    return 0;
  }
};
