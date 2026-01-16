import { supabase } from "../config/supabaseClient.js";
import AddBannerDAO from "../dao/add-banner.dao.js";

// Add a Banner
export async function addBanner(req, res) {
  try {
    const {
      name,
      banner_type,
      description,
      link,
      active,
      position,
      is_mobile,
    } = req.body;

    // Convert string boolean values to actual booleans
    const processedActive =
      active === "true" || active === true || active === undefined
        ? true
        : false;
    const processedIsMobile =
      is_mobile === "true" || is_mobile === true ? true : false;

    const imageFile = req.file;
    let imageUrl = null;

    // Upload image to Supabase Storage if a file is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("addBanner")
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true,
        });

      if (uploadError)
        return res
          .status(400)
          .json({ success: false, error: uploadError.message });
      const { data: urlData } = supabase.storage
        .from("addBanner")
        .getPublicUrl(fileName);
      imageUrl = urlData.publicUrl;
    }

    const bannerData = {
      name,
      image_url: imageUrl,
      banner_type,
      description,
      link,
      active: processedActive,
      position: position || banner_type,
      is_mobile: processedIsMobile,
    };

    const data = await AddBannerDAO.create(bannerData);
    res.status(201).json({ success: true, banner: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Update a Banner
export async function updateBanner(req, res) {
  try {
    const { id } = req.params;
    const {
      name,
      banner_type,
      description,
      link,
      active,
      position,
      is_mobile,
    } = req.body;

    // Convert string boolean values to actual booleans
    const processedActive =
      active === "true" || active === true || active === undefined
        ? true
        : false;
    const processedIsMobile =
      is_mobile === "true" || is_mobile === true ? true : false;

    const imageFile = req.file;
    let updateData = {
      name,
      banner_type,
      description,
      link,
      active: processedActive,
      position: position || banner_type,
      is_mobile: processedIsMobile,
    };

    // Update image if a new one is provided
    if (imageFile) {
      const fileExt = imageFile.originalname.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("addBanner")
        .upload(fileName, imageFile.buffer, {
          contentType: imageFile.mimetype,
          upsert: true,
        });
      if (uploadError)
        return res
          .status(400)
          .json({ success: false, error: uploadError.message });
      const { data: urlData } = supabase.storage
        .from("addBanner")
        .getPublicUrl(fileName);
      updateData.image_url = urlData.publicUrl;
    }

    const data = await AddBannerDAO.update(id, updateData);
    res.json({ success: true, banner: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete a Banner
export async function deleteBanner(req, res) {
  try {
    const { id } = req.params;
    await AddBannerDAO.delete(id);
    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View All Banners
export async function getAllBanners(req, res) {
  try {
    const data = await AddBannerDAO.list();
    res.json({ success: true, banners: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// View a Single Banner
export async function getBannerById(req, res) {
  try {
    const { id } = req.params;
    const data = await AddBannerDAO.getById(id);

    if (!data)
      return res
        .status(404)
        .json({ success: false, error: "Banner not found" });

    res.json({ success: true, banner: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Get all Banners by banner_type
export async function getBannersByType(req, res) {
  try {
    const { bannerType } = req.params;

    if (!bannerType) {
      return res
        .status(400)
        .json({ success: false, error: "Banner type is required." });
    }

    const data = await AddBannerDAO.getByType(bannerType);
    res.status(200).json({ success: true, banners: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
