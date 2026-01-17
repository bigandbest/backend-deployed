import { supabase } from "../config/supabaseClient.js";
import userNotificationDao from "../dao/user-notification.dao.js";
import cartDao from "../dao/cart.dao.js";
import wishlistDao from "../dao/wishlist.dao.js";
import productDao from "../dao/product.dao.js";

// ✅ Helper: Upload image to Supabase bucket
async function uploadNotificationImage(imageFile) {
  const fileExt = imageFile.name.split(".").pop();
  const fileName = `${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("notifications")
    .upload(fileName, imageFile);

  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage
    .from("notifications")
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// ✅ Create Notification (Admin Only)
export async function createNotification(req, res) {
  try {
    const { heading, description, expiry_date } = req.body;
    let image_url = req.body.image_url;

    if (!heading || !description || !expiry_date) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (req.file) {
      image_url = await uploadNotificationImage(req.file);
    }

    const expiryISO = new Date(`${expiry_date}T23:59:59Z`).toISOString();

    const data = await userNotificationDao.create({
      heading,
      description,
      expiry_date: expiryISO,
      image_url,
    });

    res.status(201).json({ success: true, notification: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ✅ Get User Notifications
export async function getUserNotifications(req, res) {
  try {
    const { user_id } = req.params;
    const { limit = 20, unread_only = false } = req.query;

    console.log("Getting notifications for user:", user_id);

    const userNotifications = await userNotificationDao.listByUserId(user_id, {
      unread_only: unread_only === "true",
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      notifications: userNotifications,
      unread_count: userNotifications.filter((n) => !n.is_read).length,
    });
  } catch (err) {
    console.error("getUserNotifications error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ✅ Mark Notification as Read
export async function markNotificationRead(req, res) {
  try {
    const { id } = req.params;

    const data = await userNotificationDao.update(id, {
      is_read: true,
      read_at: new Date()
    });

    if (!data) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    res.json({ success: true, notification: data });
  } catch (err) {
    console.error("markNotificationRead error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ✅ Mark All Notifications as Read
export async function markAllNotificationsRead(req, res) {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const updatedCount = await userNotificationDao.markAllAsRead(user_id);

    res.json({
      success: true,
      message: `${updatedCount} notifications marked as read`,
      updated_count: updatedCount,
    });
  } catch (err) {
    console.error("markAllNotificationsRead error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ✅ Get All Active Notifications
export async function getNotifications(req, res) {
  try {
    const data = await userNotificationDao.listByUser(null, { active_only: true });
    res.status(200).json({ success: true, notifications: data || [] });
  } catch (err) {
    console.error("getNotifications error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

// ✅ Create Order Notification
export async function createOrderNotification(userId, orderId, status) {
  try {
    const statusMessages = {
      pending: "Your order has been placed successfully!",
      processing: "Your order is being processed.",
      shipped: "Your order has been shipped!",
      delivered: "Your order has been delivered successfully!",
      cancelled: "Your order has been cancelled.",
    };

    const data = await userNotificationDao.create({
      user_id: userId,
      heading: `Order Update - ${status.charAt(0).toUpperCase() + status.slice(1)
        }`,
      description:
        statusMessages[status] || "Your order status has been updated.",
      related_id: orderId.toString(),
      related_type: "order",
      expiry_date: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
    });

    return { success: true, data };
  } catch (err) {
    console.error("Error creating order notification:", err);
    return { success: false, error: err.message };
  }
}

// ✅ Update Notification (Admin Only)
export async function updateNotification(req, res) {
  try {
    const { id } = req.params;
    const { heading, description, expiry_date } = req.body;
    let image_url = req.body.image_url;

    if (req.file) {
      image_url = await uploadNotificationImage(req.file);
    }

    const updates = {};
    if (heading) updates.heading = heading;
    if (description) updates.description = description;
    if (expiry_date)
      updates.expiry_date = new Date(`${expiry_date}T23:59:59Z`).toISOString();
    if (image_url) updates.image_url = image_url;

    const data = await userNotificationDao.update(id, updates);

    if (!data) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.json({ success: true, notification: data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ✅ Delete Notification (Admin Only)
export async function deleteNotification(req, res) {
  try {
    const { id } = req.params;
    await userNotificationDao.delete(id);
    res.status(200).json({ success: true, message: "Notification deleted" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

// ✅ Create Product Update Notification
export async function createProductUpdateNotification(
  productId,
  updateType,
  oldValue,
  newValue
) {
  try {
    // Find users who have this product in cart or wishlist
    const cartItems = await cartDao.getUsersByProduct(productId);
    const wishlistItems = await wishlistDao.getUsersByProduct(productId);

    // Get unique user IDs
    const userIds = [
      ...new Set([
        ...(cartItems?.map((item) => item.user_id) || []),
        ...(wishlistItems?.map((item) => item.user_id) || []),
      ]),
    ];

    if (userIds.length === 0) {
      return { success: true, message: "No users to notify" };
    }

    // Get product details
    const product = await productDao.getProductById(productId);

    if (!product) {
      return { success: false, error: "Product not found" };
    }

    // Create notification messages based on update type
    let heading = "";
    let description = "";

    switch (updateType) {
      case "price":
        heading = `Price Update: ${product.name}`;
        description = `The price of ${product.name} has changed from ₹${oldValue} to ₹${newValue}.`;
        break;
      case "stock":
        heading = `Stock Update: ${product.name}`;
        description =
          oldValue > newValue
            ? `Stock reduced for ${product.name}. Only ${newValue} items left.`
            : `Stock increased for ${product.name}. Now ${newValue} items available.`;
        break;
      case "availability":
        heading = `Availability Update: ${product.name}`;
        description = newValue
          ? `${product.name} is now back in stock!`
          : `${product.name} is currently out of stock.`;
        break;
      default:
        heading = `Product Update: ${product.name}`;
        description = `${product.name} has been updated. Check the latest details.`;
    }

    // Create notifications for each user
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      heading,
      description,
      related_id: productId.toString(),
      related_type: "product",
      expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    }));

    await userNotificationDao.createMany(notifications);

    return { success: true, notifiedUsers: userIds.length };
  } catch (err) {
    console.error("Error creating product update notification:", err);
    return { success: false, error: err.message };
  }
}

// ✅ Get admin notifications
export async function getAdminNotifications(req, res) {
  try {
    const data = await userNotificationDao.listAdmin();
    return res.json({ success: true, notifications: data });
  } catch (error) {
    console.error("Error fetching admin notifications:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
}

// ✅ Get unread notification count for user
export async function getUnreadCount(req, res) {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const count = await userNotificationDao.getUnreadCount(user_id);
    return res.json({ success: true, unread_count: count });
  } catch (error) {
    console.error("Error fetching unread count:", error.message);
    return res.json({ success: true, unread_count: 0 }); // Return 0 instead of error
  }
}
