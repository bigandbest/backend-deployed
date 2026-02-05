import { uploadToCloudinary } from "../services/uploadService.js";
import AboutUsDAO from "../dao/about-us.dao.js";
import TeamMemberDAO from "../dao/team-member.dao.js";
import CertificationDAO from "../dao/certification.dao.js";

// Get consolidated About Section data
export const getAboutContent = async (req, res) => {
  try {
    const [aboutContent, teamMembers, certifications] = await Promise.all([
      AboutUsDAO.getContent(),
      TeamMemberDAO.list(),
      CertificationDAO.list(true),
    ]);

    res.status(200).json({
      success: true,
      content: aboutContent || {},
      team: teamMembers || [],
      certifications: certifications || [],
    });
  } catch (err) {
    console.error("Error fetching about content:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update About Us content (Upsert)
export const updateAboutContent = async (req, res) => {
  try {
    const { id, title, subtitle, heading, content } = req.body;
    const imageFile = req.file;

    const updates = {
      title,
      subtitle,
      heading,
      content,
      updated_at: new Date(),
    };

    console.log(
      "Uploading about banner to Cloudinary:",
      imageFile.originalname,
    );
    const uploadResult = await uploadToCloudinary(
      imageFile.buffer,
      "addBanner",
      imageFile.mimetype,
    );

    if (!uploadResult.success) {
      return res
        .status(500)
        .json({ success: false, error: uploadResult.error });
    }

    updates.banner_image_url = uploadResult.secure_url;

    const data = await AboutUsDAO.updateContent(id, updates);

    res.status(200).json({ success: true, content: data });
  } catch (err) {
    console.error("Error updating about content:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
