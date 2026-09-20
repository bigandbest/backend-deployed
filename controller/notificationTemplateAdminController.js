import prisma from "../config/prisma.js";
import { logAdminAction } from "../services/referralService.js";
import {
  NOTIFICATION_VARIABLE_REGISTRY,
  DEFAULT_TEMPLATES,
  validateTemplateVariables,
} from "../services/notificationTemplateService.js";

const audit = (req, action, description, entityType, entityId, previousValue, newValue) =>
  logAdminAction(req.user.id, req.user.email, req.user.name, action, description, entityType, entityId, previousValue, newValue, req.ip);

// GET /api/admin/notification-templates — every known notification type, merged with its
// configured override if one exists, so the admin sees the full set (customized or still
// default) rather than only the rows that happen to exist in the DB.
export const listTemplates = async (req, res) => {
  try {
    const rows = await prisma.notification_templates.findMany();
    const byType = new Map(rows.map((r) => [r.notification_type, r]));

    const templates = Object.keys(NOTIFICATION_VARIABLE_REGISTRY).map((type) => {
      const row = byType.get(type);
      return {
        notification_type: type,
        supported_variables: NOTIFICATION_VARIABLE_REGISTRY[type],
        title_template: row?.title_template ?? DEFAULT_TEMPLATES[type].title,
        message_template: row?.message_template ?? DEFAULT_TEMPLATES[type].message,
        is_customized: !!row,
        is_active: row?.is_active ?? true,
        default_title: DEFAULT_TEMPLATES[type].title,
        default_message: DEFAULT_TEMPLATES[type].message,
      };
    });

    return res.json({ success: true, data: templates });
  } catch (err) {
    console.error("listTemplates error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// PUT /api/admin/notification-templates/:type
export const upsertTemplate = async (req, res) => {
  try {
    const { type } = req.params;
    const { title_template, message_template, is_active } = req.body;

    if (!NOTIFICATION_VARIABLE_REGISTRY[type]) {
      return res.status(400).json({ success: false, error: `Unknown notification_type "${type}"` });
    }
    if (!title_template || !message_template) {
      return res.status(400).json({ success: false, error: "title_template and message_template are required" });
    }
    const validationError = validateTemplateVariables(type, title_template, message_template);
    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const previous = await prisma.notification_templates.findUnique({ where: { notification_type: type } });
    const saved = await prisma.notification_templates.upsert({
      where: { notification_type: type },
      update: { title_template, message_template, is_active: is_active !== false, supported_variables: NOTIFICATION_VARIABLE_REGISTRY[type] },
      create: { notification_type: type, title_template, message_template, is_active: is_active !== false, supported_variables: NOTIFICATION_VARIABLE_REGISTRY[type] },
    });

    await audit(req, "NOTIFICATION_TEMPLATE_SAVED", `Saved template for ${type}`, "notification_templates", saved.id, previous, saved);
    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error("upsertTemplate error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};

// DELETE /api/admin/notification-templates/:type — revert to the hardcoded default.
export const deleteTemplate = async (req, res) => {
  try {
    const { type } = req.params;
    const existing = await prisma.notification_templates.findUnique({ where: { notification_type: type } });
    if (!existing) return res.json({ success: true, message: "Already using the default" });

    await prisma.notification_templates.delete({ where: { notification_type: type } });
    await audit(req, "NOTIFICATION_TEMPLATE_RESET", `Reverted ${type} to its default copy`, "notification_templates", existing.id, existing, null);
    return res.json({ success: true, message: "Reverted to default" });
  } catch (err) {
    console.error("deleteTemplate error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
