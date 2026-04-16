import { uploadToCloudinary } from "../services/uploadService.js";
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

    // Upload image if a file is provided
    if (imageFile) {
      console.log(
        "Uploading banner image to Cloudinary:",
        imageFile.originalname,
      );
      const bannerTransformation =
        banner_type === "daily_deals"
          ? [{ width: 1200, height: 400, crop: "fill", gravity: "auto", quality: "auto", fetch_format: "auto" }]
          : null;

      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "addBanner",
        imageFile.mimetype,
        null,
        bannerTransformation,
      );

      if (!uploadResult.success) {
        return res
          .status(400)
          .json({ success: false, error: uploadResult.error });
      }
      imageUrl = uploadResult.secure_url;
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
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
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
      // Get existing banner to delete old image
      const existingBanner = await AddBannerDAO.getById(id);
      console.log(
        "Uploading banner update image to Cloudinary:",
        imageFile.originalname,
      );
      const effectiveBannerType = banner_type ?? existingBanner?.banner_type;
      const bannerTransformation =
        effectiveBannerType === "daily_deals"
          ? [{ width: 1200, height: 400, crop: "fill", gravity: "auto", quality: "auto", fetch_format: "auto" }]
          : null;

      const uploadResult = await uploadToCloudinary(
        imageFile.buffer,
        "addBanner",
        imageFile.mimetype,
        existingBanner?.image_url ?? null,
        bannerTransformation,
      );

      if (!uploadResult.success) {
        return res
          .status(400)
          .json({ success: false, error: uploadResult.error });
      }
      updateData.image_url = uploadResult.secure_url;
    }

    const data = await AddBannerDAO.update(id, updateData);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
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
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({ success: true, message: "Banner deleted successfully" });
  } catch (err) {
    // P2025 is Prisma's "Record to delete does not exist" error
    if (err.code === 'P2025') {
      return res.status(200).json({ success: true, message: "Banner already deleted or not found" });
    }
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getAllBanners(req, res) {
  try {
    const data = await AddBannerDAO.list();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({ success: true, banners: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getBannerById(req, res) {
  try {
    const { id } = req.params;
    const data = await AddBannerDAO.getById(id);

    if (!data)
      return res
        .status(404)
        .json({ success: false, error: "Banner not found" });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({ success: true, banner: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getBannersByType(req, res) {
  try {
    const { bannerType } = req.params;

    if (!bannerType) {
      return res
        .status(400)
        .json({ success: false, error: "Banner type is required." });
    }

    const data = await AddBannerDAO.getByType(bannerType);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.status(200).json({ success: true, banners: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Get all Mobile-only Banners (admin view — all, including inactive)
export async function getMobileBanners(req, res) {
  try {
    const data = await AddBannerDAO.getMobileAll();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.status(200).json({ success: true, banners: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Get active Mobile-only Banners (used by mobile app)
export async function getActiveMobileBanners(req, res) {
  try {
    const data = await AddBannerDAO.getMobileActive();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.status(200).json({ success: true, banners: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
