import affiliateDAO from "../dao/affiliate.dao.js";
import { processAffiliateOrder } from "../services/affiliateService.js";

// GET /api/affiliate/track/:linkCode  - redirect with cookie
export const trackClick = async (req, res) => {
  try {
    const { linkCode } = req.params;
    const link = await affiliateDAO.getLinkByCode(linkCode);

    if (!link || !link.is_active) {
      return res.redirect(process.env.FRONTEND_URL || "https://www.bigbestmart.com");
    }

    const config = await affiliateDAO.getConfig();
    const cookieDuration = config.cookie_duration_hours * 60 * 60 * 1000;
    const cookieExpiry = new Date(Date.now() + cookieDuration);

    // Record click
    const userAgent = req.headers["user-agent"] || "";
    const ipAddress = req.ip || req.headers["x-forwarded-for"];

    const click = await affiliateDAO.createClick({
      affiliate_id: link.affiliate_id,
      link_id: link.id,
      link_code: linkCode,
      affiliate_code: link.affiliate_code,
      user_id: req.user?.id || null,
      ip_address: ipAddress,
      user_agent: userAgent,
      device_type: /mobile/i.test(userAgent) ? "mobile" : "desktop",
      referrer_url: req.headers.referer || null,
      destination_url: link.destination_url,
      cookie_expires_at: cookieExpiry,
    });

    // Update link stats
    await affiliateDAO.updateLink(link.id, {
      total_clicks: { increment: 1 },
      last_clicked_at: new Date(),
    });

    // Update profile stats
    await affiliateDAO.incrementProfileStats(link.affiliate_id, {
      total_clicks: { increment: 1 },
    });

    // Set tracking cookie
    res.cookie("_aff_ref", link.affiliate_code, {
      expires: cookieExpiry,
      httpOnly: false, // Frontend needs to read it
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.cookie("_aff_click_id", click.id, {
      expires: cookieExpiry,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    const destination = link.destination_url;
    return res.redirect(destination);
  } catch (err) {
    console.error("trackClick error:", err);
    return res.redirect(process.env.FRONTEND_URL || "https://www.bigbestmart.com");
  }
};

// POST /api/affiliate/record-click  - called by frontend when ?ref= param detected
export const recordRefClick = async (req, res) => {
  try {
    const { affiliate_code, destination_url } = req.body;
    if (!affiliate_code) {
      return res.json({ success: false, error: "affiliate_code required" });
    }

    const profile = await affiliateDAO.getProfileByCode(affiliate_code);
    if (!profile || profile.status !== "ACTIVE") {
      return res.json({ success: false, error: "Invalid affiliate code" });
    }

    const config = await affiliateDAO.getConfig();
    const cookieDuration = config.cookie_duration_hours * 60 * 60 * 1000;
    const cookieExpiry = new Date(Date.now() + cookieDuration);

    const click = await affiliateDAO.createClick({
      affiliate_id: profile.id,
      affiliate_code,
      user_id: req.user?.id || null,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"] || "",
      destination_url: destination_url || "/",
      cookie_expires_at: cookieExpiry,
    });

    await affiliateDAO.incrementProfileStats(profile.id, {
      total_clicks: { increment: 1 },
    });

    return res.json({
      success: true,
      data: { clickId: click.id, expiresAt: cookieExpiry },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// POST /api/affiliate/convert - called internally when order is placed
export const convertOrder = async (req, res) => {
  try {
    const { order_id, affiliate_code, click_id } = req.body;
    if (!order_id || !affiliate_code) {
      return res.status(400).json({ success: false, error: "order_id and affiliate_code required" });
    }

    const result = await processAffiliateOrder(order_id, affiliate_code, { clickId: click_id });

    if (!result) {
      return res.json({ success: false, message: "Order not attributed" });
    }

    // Mark click as converted
    if (click_id) {
      await affiliateDAO.markClickConverted(click_id, order_id);
    }

    return res.json({ success: true, data: { affiliateOrderId: result.id } });
  } catch (err) {
    console.error("convertOrder error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
