// Admin write path for section settings: allow-list → registry validation → transaction (row + audit) → result.
// Cache invalidation is done by the route-level middleware (middleware/homepageInvalidate.js) after a 2xx response.
import { validateSection } from './registry/index.js';

// Legacy fields the admin UI already sends; kept so existing screens keep working (component_name stays writable
// until the legacy retirement phase — it is NOT read by the feed).
const LEGACY_FIELDS = ['section_name', 'description', 'is_active', 'display_order', 'component_name', 'is_marketing', 'allow_group_mapping', 'allow_category_mapping'];
// New, registry-validated fields. section_key and section_type are immutable after creation and never accepted here.
const HOMEPAGE_FIELDS = ['config', 'platforms', 'load_mode', 'show_on_home'];

export class SectionValidationError extends Error {
  constructor(errors) { super(errors.join('; ')); this.errors = errors; }
}

const changed = (before, after) =>
  JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);

export function createSectionService({ prisma }) {
  async function mappingCounts(id) {
    const [PRODUCT, CATEGORY, GROUP, SUBCATEGORY] = await Promise.all([
      prisma.product_section_products.count({ where: { section_id: id } }),
      prisma.product_section_categories.count({ where: { section_id: id } }),
      prisma.product_section_groups.count({ where: { section_id: id } }),
      prisma.section_subcategory_mappings.count({ where: { section_id: id } }),
    ]);
    return { PRODUCT, CATEGORY, GROUP, SUBCATEGORY };
  }

  /** @returns {Promise<object|null>} updated row, or null when the section does not exist. */
  async function updateSection(id, body, actor = {}) {
    const current = await prisma.product_sections.findUnique({ where: { id } });
    if (!current) return null;

    const data = {};
    for (const k of [...LEGACY_FIELDS, ...HOMEPAGE_FIELDS]) if (body[k] !== undefined) data[k] = body[k];

    const touchesHomepage = HOMEPAGE_FIELDS.some((k) => data[k] !== undefined);
    if (touchesHomepage) {
      if (!current.section_type) throw new SectionValidationError(['this section has no section_type; homepage settings cannot be edited']);
      const parent = current.parent_section_id
        ? await prisma.product_sections.findUnique({ where: { id: current.parent_section_id }, select: { section_type: true } })
        : null;
      const result = validateSection({
        type: current.section_type,
        config: data.config !== undefined ? data.config : current.config,
        mappings: await mappingCounts(id),
        platforms: data.platforms,
        loadMode: data.load_mode,
        placement: parent ? { parentType: parent.section_type, slot: current.slot } : undefined,
      });
      if (!result.ok) throw new SectionValidationError(result.errors);
      if (data.config !== undefined) data.config = result.config; // validated + defaults applied
    }

    const diff = {};
    for (const k of Object.keys(data)) if (changed(current[k], data[k])) diff[k] = { from: current[k] ?? null, to: data[k] };
    if (Object.keys(diff).length === 0) return current;

    if (diff.config) data.config_version = (current.config_version ?? 1) + 1;
    if (actor.id) data.updated_by = String(actor.id).slice(0, 64);
    data.updated_at = new Date();

    const [updated] = await prisma.$transaction([
      prisma.product_sections.update({ where: { id }, data }),
      prisma.section_audit_log.create({
        data: {
          section_id: id,
          actor_id: actor.id ? String(actor.id).slice(0, 64) : null,
          actor_role: actor.role ? String(actor.role).slice(0, 32) : null,
          action: diff.config ? 'SECTION_CONFIG_CHANGED' : diff.is_active ? 'SECTION_TOGGLED' : 'SECTION_UPDATED',
          diff,
        },
      }),
    ]);
    return updated;
  }

  /** Records an already-applied write (toggle/reorder) that goes through the legacy DAO path. */
  async function audit(sectionId, action, diff, actor = {}) {
    try {
      await prisma.section_audit_log.create({
        data: { section_id: sectionId, actor_id: actor.id ? String(actor.id).slice(0, 64) : null, actor_role: actor.role ? String(actor.role).slice(0, 32) : null, action, diff },
      });
    } catch (e) {
      console.warn('section audit write failed:', e.message); // never fail the admin write over the audit trail
    }
  }

  return { updateSection, audit };
}
