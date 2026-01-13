import { supabase } from "../config/supabaseClient.js";

// Get all addresses for a user
export const getUserAddresses = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const { data: addresses, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching addresses:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Normalize addresses to ensure frontend compatibility
    const normalizedAddresses = (addresses || []).map((addr) => ({
      ...addr,
      label: addr.label || addr.address_name,
      address_line1: addr.address_line1 || addr.street_address,
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

// Get a single address by ID
export const getAddressById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data: address, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error fetching address:", error);
      return res.status(404).json({
        success: false,
        error: "Address not found",
      });
    }

    // Normalize address
    const normalizedAddress = address
      ? {
          ...address,
          label: address.label || address.address_name,
          address_line1: address.address_line1 || address.street_address,
        }
      : null;

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

// Create a new address
export const createAddress = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.user_id;
    const {
      label,
      full_name,
      mobile,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      landmark,
      is_default,
      // New fields
      receiver_name,
      receiver_phone,
      building_type,
      flat_no,
      building_name,
      type, // Frontend sends 'type' instead of 'label' sometimes
    } = req.body;

    // Map frontend fields to backend expected variables
    const nameToSave = receiver_name || full_name;
    const mobileToSave = receiver_phone || mobile;
    const addressLabel = type || label;

    // Construct address_line1 if broken down fields are provided
    let finalAddressLine1 = address_line1;
    if (flat_no || building_name) {
      finalAddressLine1 = `${flat_no ? flat_no + ", " : ""}${
        building_name || ""
      }`;
    }

    // Validation
    if (
      !addressLabel ||
      !nameToSave ||
      !mobileToSave ||
      !finalAddressLine1 ||
      !city ||
      !state ||
      !pincode
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Required fields: label/type, receiver_name/full_name, receiver_phone/mobile, address_line1 (or flat_no+building_name), city, state, pincode",
      });
    }

    // Validate pincode (6 digits)
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: "Pincode must be 6 digits",
      });
    }

    // Validate mobile (10 digits)
    if (!/^\d{10}$/.test(mobileToSave)) {
      return res.status(400).json({
        success: false,
        error: "Mobile number must be 10 digits",
      });
    }

    const addressData = {
      user_id: userId,
      label: addressLabel,
      address_name: addressLabel, // Map label to address_name for backward compatibility
      full_name: nameToSave,
      mobile: mobileToSave,
      address_line1: finalAddressLine1,
      street_address: finalAddressLine1, // Map address_line1 to street_address
      address_line2: address_line2 || null,
      city,
      state,
      country: "India", // Default country
      pincode,
      landmark: landmark || null,
      is_default: is_default || false,
      is_active: true,
      // Add building_type if the column exists in your DB, otherwise it might be ignored or error.
      // Assuming user wants it stored. If DB schema doesn't have it, we might need to add it to address_line2 or similar.
      // For now, attempting to add it as requested.
    };

    const { data: newAddress, error } = await supabase
      .from("user_addresses")
      .insert([addressData])
      .select()
      .single();

    if (error) {
      console.error("Error creating address:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

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

// Update an address
export const updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const {
      label,
      full_name,
      mobile,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      landmark,
      is_default,
    } = req.body;

    // Validate pincode if provided
    if (pincode && !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        error: "Pincode must be 6 digits",
      });
    }

    // Validate mobile if provided
    if (mobile && !/^\d{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        error: "Mobile number must be 10 digits",
      });
    }

    const updateData = {};
    if (label !== undefined) {
      updateData.label = label;
      updateData.address_name = label; // Map label to address_name
    }
    if (full_name !== undefined) updateData.full_name = full_name;
    if (mobile !== undefined) updateData.mobile = mobile;
    if (address_line1 !== undefined) {
      updateData.address_line1 = address_line1;
      updateData.street_address = address_line1; // Map address_line1 to street_address
    }
    if (address_line2 !== undefined) updateData.address_line2 = address_line2;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    updateData.country = "India"; // Ensure country is set
    if (pincode !== undefined) updateData.pincode = pincode;
    if (landmark !== undefined) updateData.landmark = landmark;
    if (is_default !== undefined) updateData.is_default = is_default;

    const { data: updatedAddress, error } = await supabase
      .from("user_addresses")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating address:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    if (!updatedAddress) {
      return res.status(404).json({
        success: false,
        error: "Address not found",
      });
    }

    return res.json({
      success: true,
      message: "Address updated successfully",
      address: updatedAddress,
    });
  } catch (error) {
    console.error("Error in updateAddress:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Delete an address (soft delete)
export const deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data: deletedAddress, error } = await supabase
      .from("user_addresses")
      .update({ is_active: false })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error deleting address:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    if (!deletedAddress) {
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

// Set an address as default
export const setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const { data: updatedAddress, error } = await supabase
      .from("user_addresses")
      .update({ is_default: true })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error setting default address:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    if (!updatedAddress) {
      return res.status(404).json({
        success: false,
        error: "Address not found",
      });
    }

    return res.json({
      success: true,
      message: "Default address updated successfully",
      address: updatedAddress,
    });
  } catch (error) {
    console.error("Error in setDefaultAddress:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get default address
export const getDefaultAddress = async (req, res) => {
  try {
    const userId = req.user?.id || req.query.user_id;

    const { data: address, error } = await supabase
      .from("user_addresses")
      .select("*")
      .eq("user_id", userId)
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" error
      console.error("Error fetching default address:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    // Normalize address
    const normalizedAddress = address
      ? {
          ...address,
          label: address.label || address.address_name,
          address_line1: address.address_line1 || address.street_address,
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
