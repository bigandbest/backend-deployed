// services/notificationTemplateService.js
// Marketing Control Center Q1 — admin-editable copy for the existing in-app notification system
// only (no SMS/WhatsApp/Email sending exists anywhere in this codebase). Centralized here rather
// than inline in referralService.js so the registry/interpolation logic isn't duplicated.
import prisma from "../config/prisma.js";

// Every {{variable}} a notification type is allowed to reference — grounded in what each call
// site actually has available, not invented. Used to validate admin-authored templates at save
// time so a typo'd {{variable}} fails loudly instead of silently rendering empty.
export const NOTIFICATION_VARIABLE_REGISTRY = {
  REFERRAL_SIGNUP: ["referee_name"],
  REFERRAL_ORDER_PLACED: [],
  REFERRAL_ORDER_DELIVERED: [],
  REWARD_CREDITED: ["amount", "validity_days"],
  WITHDRAWAL_REQUESTED: ["amount"],
  REWARD_EXPIRED: ["amount"],
  REWARD_EXPIRING_SOON: ["amount"],
  REWARD_EXPIRING_URGENT: ["amount"],
  ADMIN_CREDIT_RECEIVED: ["amount", "validity_days"],
  WITHDRAWAL_REJECTED: ["amount", "reason"],
  WITHDRAWAL_COMPLETED: ["amount"],
};

// The exact copy that already existed inline at each call site, now expressed with the same
// {{variable}} syntax as admin-authored templates — one interpolation path for both (Q1).
export const DEFAULT_TEMPLATES = {
  REFERRAL_SIGNUP: { title: "New Referral!", message: "{{referee_name}} joined using your referral code!" },
  REFERRAL_ORDER_PLACED: { title: "Order Placed", message: "Your referee placed an order! Reward pending after delivery." },
  REFERRAL_ORDER_DELIVERED: { title: "Order Delivered", message: "Order delivered! Your reward will be credited after the return window." },
  REWARD_CREDITED: { title: "Reward Credited!", message: "₹{{amount}} has been credited to your wallet! Valid for {{validity_days}} days." },
  WITHDRAWAL_REQUESTED: { title: "Withdrawal Initiated", message: "Withdrawal of ₹{{amount}} has been initiated." },
  REWARD_EXPIRED: { title: "Reward Expired", message: "Your ₹{{amount}} reward has expired. Keep referring to earn more!" },
  REWARD_EXPIRING_SOON: { title: "Reward Expiring Soon", message: "Your ₹{{amount}} reward expires in 2 days! Use or withdraw now." },
  REWARD_EXPIRING_URGENT: { title: "Last Chance!", message: "Your ₹{{amount}} reward expires tomorrow! Don't miss out." },
  ADMIN_CREDIT_RECEIVED: { title: "Reward Credited!", message: "₹{{amount}} has been credited to your referral wallet. Valid for {{validity_days}} days." },
  WITHDRAWAL_REJECTED: { title: "Withdrawal Rejected", message: "Your withdrawal request of ₹{{amount}} was rejected. Reason: {{reason}}" },
  WITHDRAWAL_COMPLETED: { title: "Withdrawal Successful", message: "₹{{amount}} has been transferred to your account." },
};

export const interpolate = (template, variables = {}) =>
  String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => (variables[key] != null ? String(variables[key]) : ""));

const extractVariableTokens = (text) => [...String(text || "").matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

// Returns an error string, or null if valid. Checked against the registry, not against
// whatever happens to be in DEFAULT_TEMPLATES, so a new supported variable can be registered
// without needing a matching default template to exist.
export const validateTemplateVariables = (notificationType, titleTemplate, messageTemplate) => {
  const allowed = NOTIFICATION_VARIABLE_REGISTRY[notificationType];
  if (!allowed) return `Unknown notification_type "${notificationType}"`;
  const used = new Set([...extractVariableTokens(titleTemplate), ...extractVariableTokens(messageTemplate)]);
  const unsupported = [...used].filter((v) => !allowed.includes(v));
  if (unsupported.length > 0) {
    return `Unsupported variable(s) for ${notificationType}: ${unsupported.map((v) => `{{${v}}}`).join(", ")}. Supported: ${allowed.map((v) => `{{${v}}}`).join(", ") || "(none)"}`;
  }
  return null;
};

// The single render path createNotification calls — DB template (if configured & active) wins,
// otherwise the hardcoded default. Both go through the same interpolate() call.
export const renderNotification = async (notificationType, variables = {}) => {
  const template = await prisma.notification_templates.findUnique({ where: { notification_type: notificationType } });
  const source = template?.is_active ? template : DEFAULT_TEMPLATES[notificationType];
  if (!source) return null; // unknown type — caller decides what to do
  const titleTemplate = template?.is_active ? template.title_template : source.title;
  const messageTemplate = template?.is_active ? template.message_template : source.message;
  return { title: interpolate(titleTemplate, variables), message: interpolate(messageTemplate, variables) };
};
