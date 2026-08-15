import prisma from "../config/prisma.js";
import axios from "axios";
import redis from "../config/redis.js";

// Matches WAREHOUSE_CACHE_TTL in services/warehouseService.js — same
// pincode-to-warehouse relationship, same acceptable staleness window.
const SERVICEABILITY_CACHE_TTL = parseInt(process.env.SERVICEABILITY_CACHE_TTL || '300', 10);
const serviceabilityCacheKey = (pincode) => `serviceability:${pincode}`;

export const getUserAddresses = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const addresses = await prisma.user_addresses.findMany({
      where: { user_id: userId },
      orderBy: [
        { is_default: 'desc' },
        { created_at: 'desc' }
      ]
    });

    const normalizedAddresses = addresses.map((addr) => ({
      ...addr,
      label: addr.address_name,
      address_line1: addr.street_address,
      address_line2: addr.suite_unit_floor,
      pincode: addr.postal_code,
      full_name: addr.full_name || "",
      mobile: addr.mobile || "",
    }));

    return res.json({
      success: true,
      addresses: normalizedAddresses,
    });
  } catch (error) {
    console.error("Error in getUserAddresses:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getAddressById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const address = await prisma.user_addresses.findFirst({
      where: {
        id,
        user_id: userId
      }
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        error: "Address not found",
      });
    }

    const normalizedAddress = {
      ...address,
      label: address.address_name,
      address_line1: address.street_address,
      address_line2: address.suite_unit_floor,
      pincode: address.postal_code,
      full_name: address.full_name || "",
      mobile: address.mobile || "",
    };

    return res.json({
      success: true,
      address: normalizedAddress,
    });
  } catch (error) {
    console.error("Error in getAddressById:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const createAddress = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id;
    const {
      label,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      landmark,
      is_default,
      house_number,
      locality,
      // Frontend compatibility fields
      type,
      receiver_name,
      receiver_phone,
      full_name,
      mobile,
    } = req.body;

    // Map frontend fields to backend schema
    const addressLabel = label || type;
    const nameToSave = full_name || receiver_name;
    const mobileToSave = mobile || receiver_phone;

    if (!addressLabel || !address_line1 || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        error: "Required fields: label, address_line1, city, state, pincode",
      });
    }

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: "Pincode must be 6 digits",
      });
    }

    const newAddress = await prisma.user_addresses.create({
      data: {
        user_id: userId,
        address_name: addressLabel,
        full_name: nameToSave || null,
        mobile: mobileToSave || null,
        street_address: address_line1,
        suite_unit_floor: address_line2 || null,
        house_number: house_number || null,
        locality: locality || null,
        city,
        state,
        country: "India",
        postal_code: pincode,
        landmark: landmark || null,
        is_default: is_default || false,
      }
    });

    return res.status(201).json({
      success: true,
      message: "Address created successfully",
      address: newAddress,
    });
  } catch (error) {
    console.error("Error in createAddress:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const {
      label,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      landmark,
      is_default,
      house_number,
      locality,
      // Frontend compatibility fields
      type,
      receiver_name,
      receiver_phone,
      full_name,
      mobile,
    } = req.body;

    // Map frontend fields to backend schema
    const addressLabel = label || type;
    const nameToSave = full_name || receiver_name;
    const mobileToSave = mobile || receiver_phone;

    if (pincode && !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: "Pincode must be 6 digits",
      });
    }

    const updateData = {};
    if (addressLabel !== undefined) updateData.address_name = addressLabel;
    if (address_line1 !== undefined) updateData.street_address = address_line1;
    if (address_line2 !== undefined) updateData.suite_unit_floor = address_line2;
    if (house_number !== undefined) updateData.house_number = house_number;
    if (locality !== undefined) updateData.locality = locality;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (pincode !== undefined) updateData.postal_code = pincode;
    if (landmark !== undefined) updateData.landmark = landmark;
    if (is_default !== undefined) updateData.is_default = is_default;
    if (nameToSave !== undefined) updateData.full_name = nameToSave;
    if (mobileToSave !== undefined) updateData.mobile = mobileToSave;
    updateData.updated_at = new Date();

    const updatedAddress = await prisma.user_addresses.updateMany({
      where: {
        id,
        user_id: userId
      },
      data: updateData
    });

    if (updatedAddress.count === 0) {
      return res.status(404).json({
        success: false,
        error: "Address not found",
      });
    }

    const address = await prisma.user_addresses.findUnique({
      where: { id }
    });

    return res.json({
      success: true,
      message: "Address updated successfully",
      address,
    });
  } catch (error) {
    console.error("Error in updateAddress:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const deletedAddress = await prisma.user_addresses.deleteMany({
      where: {
        id,
        user_id: userId
      }
    });

    if (deletedAddress.count === 0) {
      return res.status(404).json({
        success: false,
        error: "Address not found",
      });
    }

    return res.json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteAddress:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    await prisma.$transaction(async (tx) => {
      await tx.user_addresses.updateMany({
        where: { user_id: userId },
        data: { is_default: false }
      });

      await tx.user_addresses.updateMany({
        where: {
          id,
          user_id: userId
        },
        data: { is_default: true }
      });
    });

    const address = await prisma.user_addresses.findUnique({
      where: { id }
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        error: "Address not found",
      });
    }

    return res.json({
      success: true,
      message: "Default address updated successfully",
      address,
    });
  } catch (error) {
    console.error("Error in setDefaultAddress:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getDefaultAddress = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;

    const address = await prisma.user_addresses.findFirst({
      where: {
        user_id: userId,
        is_default: true
      }
    });

    const normalizedAddress = address
      ? {
        ...address,
        label: address.address_name,
        address_line1: address.street_address,
        address_line2: address.suite_unit_floor,
        pincode: address.postal_code,
      }
      : null;

    return res.json({
      success: true,
      address: normalizedAddress,
    });
  } catch (error) {
    console.error("Error in getDefaultAddress:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const reverseGeocode = async (req, res) => {
  try {
    const { lat, lng, lon } = req.query;
    const longitude = lng || lon;

    if (!lat || !longitude) {
      return res.status(400).json({
        success: false,
        error: "Latitude and Longitude are required",
      });
    }

    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse`,
      {
        params: {
          format: "json",
          lat,
          lon: longitude,
          zoom: 18,
          addressdetails: 1,
        },
        headers: {
          "User-Agent": "BigBestMart/1.0 (contact@bigbestmart.com)",
        },
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("Geocoding Proxy Error:", error.message);
    return res.status(502).json({
      success: false,
      error: "Failed to fetch address from geocoding service",
    });
  }
};

export const checkServiceability = async (req, res) => {
  try {
    const pincode = String(req.params.pincode || "").trim();

    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: "Valid 6-digit pincode is required",
      });
    }

    const cacheKey = serviceabilityCacheKey(pincode);
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return res.json(JSON.parse(cached));

    // Division and zonal lookups are independent of each other — run them
    // concurrently instead of one-await-at-a-time (each is a separate
    // network round-trip to the DB).
    const [mapping, zonePincode] = await Promise.all([
      // Find division warehouse directly mapped to this pincode
      prisma.warehouse_pincodes.findFirst({
        where: {
          pincode,
          is_active: true,
          warehouse: {
            is_active: true,
          },
        },
        include: { warehouse: true },
      }),
      // Find zonal warehouse serving the same pincode through its delivery zone
      prisma.zone_pincodes.findFirst({
        where: { pincode, is_active: true },
        include: {
          delivery_zones: {
            include: {
              warehouse_zones: {
                where: { is_active: true },
                include: {
                  warehouses: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const zonalWarehouse =
      zonePincode?.delivery_zones?.warehouse_zones
        ?.map((warehouseZone) => warehouseZone.warehouses)
        ?.find((warehouse) => warehouse?.is_active && warehouse?.type?.toLowerCase() === "zonal") || null;

    if (!mapping && !zonalWarehouse) {
      const notServiceablePayload = {
        success: true,
        serviceable: false,
        tagline: "Not serviceable at this location",
      };
      redis.setex(cacheKey, SERVICEABILITY_CACHE_TTL, JSON.stringify(notServiceablePayload)).catch(() => {});
      return res.json(notServiceablePayload);
    }

    const warehouseType = mapping?.warehouse?.type?.toLowerCase() || zonalWarehouse?.type?.toLowerCase() || null;
    const displayWarehouse = zonalWarehouse || mapping?.warehouse || null;

    // Default tagline
    let tagline = "Aapke Ghar tak in 2 hours";
    let estimation = null;

    if (warehouseType === 'division') {
      tagline = "Aapke Ghar tak in 2 hours";
      estimation = "2hours and 20min";
    } else {
      tagline = "Same Day Delivery";
    }

    const servicePayload = {
      success: true,
      serviceable: true,
      warehouse_type: warehouseType,
      warehouse_id: mapping?.warehouse?.id || zonalWarehouse?.id || null,
      warehouse_name: mapping?.warehouse?.name || zonalWarehouse?.name || null,
      warehouse_location: mapping?.warehouse?.location || zonalWarehouse?.location || null,
      header_warehouse_id: displayWarehouse?.id || null,
      header_warehouse_name: displayWarehouse?.name || null,
      header_warehouse_type: displayWarehouse?.type?.toLowerCase() || null,
      header_warehouse_location: displayWarehouse?.location || null,
      tagline,
      estimation,
      delivery_days: mapping?.delivery_days || null
    };
    redis.setex(cacheKey, SERVICEABILITY_CACHE_TTL, JSON.stringify(servicePayload)).catch(() => {});
    return res.json(servicePayload);
  } catch (error) {
    console.error("Serviceability Check Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
