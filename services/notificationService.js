// Notification Service
// Handles FCM push notifications for customers, sellers, and riders

import admin from '../config/firebase.js';
import prisma from '../config/prisma.js';

// ─── Helper ────────────────────────────────────────────────────────────────

const getToken = async (userId) => {
    if (!userId) return null;
    try {
        const user = await prisma.users.findUnique({
            where: { id: userId },
            select: { fcm_token: true },
        });
        return user?.fcm_token || null;
    } catch {
        return null;
    }
};

const send = async (token, notification, data = {}) => {
    if (!token || !admin.apps.length) return;
    try {
        const response = await admin.messaging().send({
            token,
            notification,
            data: { ...data, timestamp: String(Date.now()) },
            android: { priority: 'high', notification: { channelId: 'order_updates', sound: 'default' } },
            apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        });
        console.log('✅ Notification sent:', response);
        return response;
    } catch (err) {
        console.error('❌ FCM error:', err.message);
    }
};

// ─── Order status ───────────────────────────────────────────────────────────

const STATUS_MESSAGES = {
    accepted:         { title: '✅ Order Accepted!',    body: 'Your order has been accepted and is being prepared.' },
    out_for_delivery: { title: '🛵 On the Way!',        body: 'Your rider has picked up your order and is heading to you.' },
    delivered:        { title: '🎉 Order Delivered!',   body: 'Your order has been delivered. Enjoy!' },
    delay:            { title: '⏳ Order Delayed',      body: 'Your order is running a bit late. We apologize for the inconvenience.' },
};

export const notifyCustomer = async (customerFCMToken, status, orderId) => {
    const message = STATUS_MESSAGES[status];
    if (!message || !customerFCMToken) return;
    await send(customerFCMToken, message, { orderId: String(orderId), status, type: 'ORDER_STATUS_UPDATE' });
};

// ─── Seller ─────────────────────────────────────────────────────────────────

export const notifySellerNewOrder = async (sellerFCMToken, orderId, customerName, totalAmount) => {
    if (!sellerFCMToken) return;
    await send(
        sellerFCMToken,
        { title: '🛒 New Order Request!', body: `${customerName} placed a new order (₹${totalAmount}). Tap to review.` },
        { orderId: String(orderId), type: 'NEW_ORDER' }
    );
};

// ─── Rider ──────────────────────────────────────────────────────────────────

export const notifyRiderNewDelivery = async (riderFCMToken, orderId, customerName, pickupAddress, deliveryAddress) => {
    if (!riderFCMToken) return;
    await send(
        riderFCMToken,
        { title: '📦 New Delivery Assigned!', body: `Pick up from seller and deliver to ${customerName}` },
        { orderId: String(orderId), type: 'DELIVERY_ASSIGNED', pickupAddress: pickupAddress || '', deliveryAddress: deliveryAddress || '' }
    );
};

// ─── Return orders ──────────────────────────────────────────────────────────

export const notifyReturnCreated = async ({ userId, orderId, returnId, returnType }) => {
    const token = await getToken(userId);
    await send(
        token,
        { title: '↩️ Return Request Received', body: 'Your return request has been submitted and is under review.' },
        { orderId: String(orderId), returnId: String(returnId), returnType: returnType || '', type: 'RETURN_CREATED' }
    );
};

export const notifyReturnStatusUpdated = async ({ userId, returnId, status, returnType }) => {
    const token = await getToken(userId);
    const messages = {
        approved: { title: '✅ Return Approved',    body: 'Your return has been approved. Refund will be processed shortly.' },
        rejected: { title: '❌ Return Rejected',    body: 'Your return request has been reviewed and rejected.' },
        refunded: { title: '💰 Refund Processed',   body: 'Your refund has been processed successfully.' },
    };
    const message = messages[status] || { title: 'Return Update', body: `Your return status is now: ${status}` };
    await send(
        token,
        message,
        { returnId: String(returnId), status, returnType: returnType || '', type: 'RETURN_STATUS_UPDATE' }
    );
};

// ─── Refunds ────────────────────────────────────────────────────────────────

export const notifyRefundCreated = async ({ userId, orderId, refundId, amount }) => {
    const token = await getToken(userId);
    await send(
        token,
        { title: '💳 Refund Requested', body: `A refund of ₹${amount} has been initiated for your order.` },
        { orderId: String(orderId), refundId: String(refundId), amount: String(amount), type: 'REFUND_CREATED' }
    );
};

export const notifyRefundStatusUpdated = async ({ userId, refundId, status, amount }) => {
    const token = await getToken(userId);
    const messages = {
        approved: { title: '✅ Refund Approved',    body: `Your refund of ₹${amount} has been approved.` },
        rejected: { title: '❌ Refund Rejected',    body: 'Your refund request has been reviewed and rejected.' },
        processed: { title: '💰 Refund Processed',  body: `₹${amount} has been credited back to your account.` },
    };
    const message = messages[status] || { title: 'Refund Update', body: `Your refund status is now: ${status}` };
    await send(
        token,
        message,
        { refundId: String(refundId), status, amount: String(amount), type: 'REFUND_STATUS_UPDATE' }
    );
};

// ─── Broadcast ──────────────────────────────────────────────────────────────

export const broadcastNotification = async (fcmTokens, notification, data) => {
    if (!fcmTokens?.length || !admin.apps.length) return;
    try {
        const response = await admin.messaging().sendEachForMulticast({
            tokens: fcmTokens,
            notification,
            data: { ...data, timestamp: String(Date.now()) },
            android: { priority: 'high' },
        });
        console.log(`✅ Broadcast sent to ${response.successCount}/${fcmTokens.length} devices`);
        return response;
    } catch (err) {
        console.error('❌ Broadcast error:', err.message);
    }
};
