import affiliateDAO from "../dao/affiliate.dao.js";
import { generateAffiliateCode } from "../services/affiliateService.js";

// POST /api/affiliate/apply
export const applyForAffiliate = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Auth required" });

    // Check existing application
    const existing = await affiliateDAO.getApplicationByUserId(userId);
    if (existing && ["PENDING", "UNDER_REVIEW", "APPROVED"].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        error: "You already have an active application",
        data: { status: existing.status, applicationId: existing.id },
      });
    }

    const {
      full_name, email, phone, pan_number,
      website_url, youtube_channel, instagram_handle, twitter_handle, facebook_page,
      primary_platform, estimated_audience, niche_categories,
      promotion_strategy, previous_experience,
      payment_method, bank_name, bank_account_number, bank_ifsc_code,
      account_holder_name, upi_id,
    } = req.body;

    if (!full_name || !phone || !primary_platform || !promotion_strategy) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const config = await affiliateDAO.getConfig();

    const application = await affiliateDAO.createApplication({
      user_id: userId,
      email: email && String(email).trim() ? String(email).trim() : null,
      full_name,
      phone,
      pan_number,
      website_url,
      youtube_channel,
      instagram_handle,
      twitter_handle,
      facebook_page,
      primary_platform,
      estimated_audience: estimated_audience ? parseInt(estimated_audience) : null,
      niche_categories: Array.isArray(niche_categories) ? niche_categories : [],
      promotion_strategy,
      previous_experience,
      payment_method: payment_method || "BANK_TRANSFER",
      bank_name,
      bank_account_number,
      bank_ifsc_code,
      account_holder_name,
      upi_id,
      agreed_to_terms: true,
      agreed_at: new Date(),
      ip_address: req.ip,
      status: config.auto_approve ? "APPROVED" : "PENDING",
    });

    // Auto-approve flow
    if (config.auto_approve) {
      await _createProfileFromApplication(application, full_name);
    }

    return res.status(201).json({
      success: true,
      message: config.auto_approve
        ? "Application approved automatically! Check your affiliate dashboard."
        : "Application submitted successfully. We'll review it within 2-3 business days.",
      data: { applicationId: application.id, status: application.status },
    });
  } catch (err) {
    console.error("applyForAffiliate error:", err);
    return res.status(500).json({ success: false, error: "Failed to submit application" });
  }
};

// GET /api/affiliate/application-status
export const getApplicationStatus = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Auth required" });

    let application;
    try {
      application = await affiliateDAO.getApplicationByUserId(userId);
    } catch (dbErr) {
      // Table may not exist yet — treat as no application
      console.warn("getApplicationStatus: affiliate table unavailable:", dbErr.message);
      return res.json({ success: true, data: null });
    }
    if (!application) {
      return res.json({ success: true, data: null });
    }

    // If approved, also get profile info
    let profileData = null;
    if (application.status === "APPROVED") {
      const profile = await affiliateDAO.getProfileByUserId(userId);
      if (profile) {
        profileData = {
          affiliateCode: profile.affiliate_code,
          status: profile.status,
          tierName: profile.tier_name,
        };
      }
    }

    return res.json({
      success: true,
      data: {
        applicationId: application.id,
        status: application.status,
        submittedAt: application.submitted_at,
        reviewNotes: application.review_notes,
        rejectionReason: application.rejection_reason,
        profile: profileData,
      },
    });
  } catch (err) {
    console.error("getApplicationStatus error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// Internal helper: create profile from application
export const _createProfileFromApplication = async (application, displayName) => {
  const affiliateCode = await generateAffiliateCode(application.phone || displayName || application.full_name);
  return affiliateDAO.createProfile({
    user_id: application.user_id,
    application_id: application.id,
    affiliate_code: affiliateCode,
    display_name: application.full_name,
    email: application.email,
    phone: application.phone,
    pan_number: application.pan_number,
    primary_platform: application.primary_platform,
    website_url: application.website_url,
    social_links: {
      youtube: application.youtube_channel,
      instagram: application.instagram_handle,
      twitter: application.twitter_handle,
      facebook: application.facebook_page,
    },
    payment_method: application.payment_method,
    bank_name: application.bank_name,
    bank_account_number: application.bank_account_number,
    bank_ifsc_code: application.bank_ifsc_code,
    account_holder_name: application.account_holder_name,
    upi_id: application.upi_id,
    status: "ACTIVE",
  });
};
