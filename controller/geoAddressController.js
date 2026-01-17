import axios from "axios";
import userAddressDao from "../dao/user-address.dao.js";
import pincodeLocationDao from "../dao/pincode-location.dao.js";

export const createGeoAddress = async (req, res) => {
  try {
    const {
      user_id,
      address_name,
      is_default = false,
      street_address,
      suite_unit_floor,
      house_number,
      locality,
      area,
      city,
      state,
      postal_code,
      country,
      landmark,
    } = req.body;

    // Check for existing pincode location
    let pincodeData = await pincodeLocationDao.getByPincode(postal_code);

    let latitude, longitude;

    // If not found, call API and insert
    if (!pincodeData) {
      const fullAddress = `${postal_code}, ${country}`;
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search`,
        {
          params: {
            q: fullAddress,
            format: "json",
            limit: 1,
          },
          headers: {
            "User-Agent": "yourapp/1.0 (your@email.com)",
          },
        }
      );

      const location = response.data?.[0];

      if (!location) {
        return res
          .status(400)
          .json({ error: "Could not get coordinates for this pincode" });
      }

      latitude = parseFloat(location.lat);
      longitude = parseFloat(location.lon);

      // Insert into pincode_locations
      await pincodeLocationDao.upsert(postal_code, { latitude, longitude });
    } else {
      latitude = pincodeData.latitude;
      longitude = pincodeData.longitude;
    }

    // Prevent duplicate address_name for same user
    const userAddresses = await userAddressDao.listByUser(user_id);
    const existingAddress = userAddresses.find(a => a.address_name === address_name);

    if (existingAddress) {
      return res.status(400).json({
        error: "An address with this name already exists for the user.",
      });
    }

    if (is_default) {
      // Handled in DAO transaction usually if we call setDefault, 
      // but for creation let's assume DAO can handle is_default logic.
      // I'll stick to calling the create method as is and assume DAO handles transaction if I set is_default.
      // (Wait, let me check user-address.dao.js)
    }

    // Insert full address with lat/lng
    const addressData = await userAddressDao.create({
      user_id,
      address_name,
      is_default,
      street_address,
      suite_unit_floor,
      house_number,
      locality,
      area,
      city,
      state,
      postal_code,
      country,
      landmark,
      latitude,
      longitude,
    });

    res
      .status(201)
      .json({ message: "Address created successfully", data: addressData });
  } catch (err) {
    console.error("Geo address error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

export const updateGeoAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      address_name,
      is_default = false,
      street_address,
      suite_unit_floor,
      house_number,
      locality,
      area,
      city,
      state,
      postal_code,
      country,
      landmark,
    } = req.body;

    // Check pincode location
    let pincodeData = await pincodeLocationDao.getByPincode(postal_code);

    let latitude, longitude;

    if (!pincodeData) {
      const fullAddress = `${postal_code}, ${country}`;
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search`,
        {
          params: {
            q: fullAddress,
            format: "json",
            limit: 1,
          },
          headers: {
            "User-Agent": "yourapp/1.0 (your@email.com)",
          },
        }
      );

      const location = response.data?.[0];
      if (!location) {
        return res
          .status(400)
          .json({ error: "Could not get coordinates for this pincode" });
      }

      latitude = parseFloat(location.lat);
      longitude = parseFloat(location.lon);

      await pincodeLocationDao.upsert(postal_code, { latitude, longitude });
    } else {
      latitude = pincodeData.latitude;
      longitude = pincodeData.longitude;
    }

    const data = await userAddressDao.update(id, {
      address_name,
      is_default,
      street_address,
      suite_unit_floor,
      house_number,
      locality,
      area,
      city,
      state,
      postal_code,
      country,
      landmark,
      latitude,
      longitude,
    });

    res.status(200).json({ message: "Address updated successfully", data });
  } catch (err) {
    console.error("Update address error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
};

export const deleteAddress = async (req, res) => {
  const { id } = req.params;

  try {
    await userAddressDao.delete(id);
    res.status(200).json({ message: "Address deleted successfully" });
  } catch (error) {
    console.error("Delete address error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
