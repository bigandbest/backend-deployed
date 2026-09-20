// Growth-program hook call sites see "Delivered"/"DELIVERED"/"delivered" etc. from different order flows.
export const normalizeOrderStatus = (status) => String(status || "").trim().toLowerCase();

export const isDeliveredStatus = (status) => normalizeOrderStatus(status) === "delivered";

export const isCancelledStatus = (status) => normalizeOrderStatus(status) === "cancelled";
