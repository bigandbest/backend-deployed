/**
 * Central Notification Service
 *
 * Architecture: currently writes directly to the DB.
 * RabbitMQ integration: replace publishEvent() body with an actual
 * channel.publish() call when the message broker is ready.
 * Every other part of this file stays the same.
 */

import prisma from "../config/prisma.js";

// ---------------------------------------------------------------------------
// RabbitMQ placeholder
// When RabbitMQ is wired, swap this function's body:
//   import amqp from "amqplib";
//   const channel = await amqp.connect(...).createChannel();
//   channel.assertQueue(QUEUE_NAME);
//   channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(payload)));
// ---------------------------------------------------------------------------
async function publishEvent(eventType, payload) {
  // TODO: replace with RabbitMQ publish when broker is available
  // For now, persist notification directly to DB
  try {
    await prisma.user_notifications.create({
      data: {
        user_id: payload.user_id || null,
        type: eventType,
        title: payload.title,
        message: payload.message,
        related_id: payload.related_id || null,
        related_type: payload.related_type || null,
        is_read: false,
      },
    });
  } catch (err) {
    // Notification failure must never crash the parent request
    console.error("[NotificationService] Failed to persist notification:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Return / Cancellation notifications
// ---------------------------------------------------------------------------
export async function notifyReturnCreated({ userId, orderId, returnId, returnType }) {
  const label = returnType === "cancellation" ? "Cancellation" : "Return";
  await publishEvent("return_created", {
    user_id: userId,
    title: `${label} Request Received`,
    message: `Your ${label.toLowerCase()} request has been submitted and is pending review.`,
    related_id: returnId,
    related_type: "return_order",
  });
}

export async function notifyReturnStatusUpdated({ userId, returnId, status, returnType }) {
  const label = returnType === "cancellation" ? "cancellation" : "return";
  const messages = {
    approved:    `Your ${label} request has been approved. Refund processing will begin shortly.`,
    rejected:    `Your ${label} request has been declined. Please contact support for more details.`,
    processing:  `Your ${label} refund is being processed. It will be credited to your account soon.`,
    completed:   `Your ${label} has been completed. The refund amount has been credited to your bank account.`,
  };
  await publishEvent("return_status_updated", {
    user_id: userId,
    title: `${label.charAt(0).toUpperCase() + label.slice(1)} Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    message: messages[status] || `Your ${label} request status has been updated to ${status}.`,
    related_id: returnId,
    related_type: "return_order",
  });
}

export async function notifyAdminNewReturn({ adminUserIds = [], returnId, orderId, customerName, returnType, amount }) {
  const label = returnType === "cancellation" ? "Cancellation" : "Return";
  for (const adminId of adminUserIds) {
    await publishEvent("admin_new_return", {
      user_id: adminId,
      title: `New ${label} Request`,
      message: `${customerName} submitted a ${label.toLowerCase()} request for order #${orderId?.slice(0, 8)}. Refund: ₹${amount}.`,
      related_id: returnId,
      related_type: "return_order",
    });
  }
}

// ---------------------------------------------------------------------------
// Refund request notifications
// ---------------------------------------------------------------------------
export async function notifyRefundCreated({ userId, orderId, refundId, amount }) {
  await publishEvent("refund_created", {
    user_id: userId,
    title: "Refund Request Submitted",
    message: `Your refund request of ₹${amount} for order #${orderId?.slice(0, 8)} has been submitted and is pending review.`,
    related_id: refundId,
    related_type: "refund_request",
  });
}

export async function notifyRefundStatusUpdated({ userId, refundId, status, amount }) {
  const messages = {
    approved:    `Your refund of ₹${amount} has been approved and will be transferred to your bank account.`,
    rejected:    `Your refund request of ₹${amount} has been declined. Please contact support for assistance.`,
    processing:  `Your refund of ₹${amount} is being processed. Bank transfer in progress.`,
    completed:   `Your refund of ₹${amount} has been credited to your bank account successfully.`,
  };
  await publishEvent("refund_status_updated", {
    user_id: userId,
    title: `Refund ${status.charAt(0).toUpperCase() + status.slice(1)}`,
    message: messages[status] || `Your refund status has been updated to ${status}.`,
    related_id: refundId,
    related_type: "refund_request",
  });
}
