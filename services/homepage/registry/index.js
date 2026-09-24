import { SECTION_DEFINITIONS, MAPPING_KINDS, LOAD_MODES, PLATFORMS } from './definitions.js';
import { validateConfig, describeSchema } from './schema.js';

export { MAPPING_KINDS, LOAD_MODES, PLATFORMS };

export const SECTION_KEY_PATTERN = /^[a-z0-9_]{3,100}$/;

export const getDefinition = (type) =>
  Object.prototype.hasOwnProperty.call(SECTION_DEFINITIONS, type) ? SECTION_DEFINITIONS[type] : null;

export const listTypes = () => Object.keys(SECTION_DEFINITIONS);

/** Registry metadata for the admin UI (drives which mapping tabs / config inputs / contract text are shown). */
export const describeTypes = () =>
  Object.values(SECTION_DEFINITIONS).map((d) => ({
    type: d.type,
    label: d.label,
    mappings: d.mappings,
    defaultLoad: d.defaultLoad,
    platforms: d.platforms,
    isParent: d.isParent,
    usesProducts: d.usesProducts,
    usesCategories: d.usesCategories,
    supportsPagination: d.supportsPagination,
    renderer: d.renderer,
    emptyBehavior: d.emptyBehavior,
    errorBehavior: d.errorBehavior,
    availability: d.availability,
    source: d.source,
    selection: d.selection,
    ordering: d.ordering,
    config: describeSchema(d.configSchema),
  }));

/**
 * The ONE definition of "can this section appear on the homepage?". The feed's SQL filter (PlanLoader: is_active,
 * show_on_home, section_type NOT NULL) and platform filter (HomepageFeedService.prepare) implement exactly these rules;
 * the admin list uses this function so the UI can never call a section "visible" when the feed would not render it.
 *
 * Reasons (all that apply): HIDDEN (is_active=false), NOT_ON_HOME (show_on_home=false), NO_SECTION_TYPE, UNKNOWN_TYPE,
 * NO_SUPPORTED_PLATFORM, PARENT_NOT_ELIGIBLE (pair child whose parent cannot render).
 *
 * @param {{ is_active?: boolean|null, show_on_home?: boolean|null, section_type?: string|null, platforms?: string[]|null }} section
 * @param {{ parent?: object|null }} [opts] the parent row when `section` is a pair child
 * @returns {{ eligible: boolean, reasons: string[], platforms: string[] }} platforms = where it can actually render
 */
export function homepageEligibility(section, { parent = null } = {}) {
  const reasons = [];
  if (section.is_active !== true) reasons.push('HIDDEN');
  if (section.show_on_home !== true) reasons.push('NOT_ON_HOME');
  const def = section.section_type ? getDefinition(section.section_type) : null;
  if (!section.section_type) reasons.push('NO_SECTION_TYPE');
  else if (!def) reasons.push('UNKNOWN_TYPE');
  const platforms = def ? PLATFORMS.filter((p) => def.platforms.includes(p) && (section.platforms || []).includes(p)) : [];
  if (def && platforms.length === 0) reasons.push('NO_SUPPORTED_PLATFORM');
  if (parent) {
    const p = homepageEligibility(parent);
    if (!p.eligible) reasons.push('PARENT_NOT_ELIGIBLE');
  }
  return { eligible: reasons.length === 0, reasons, platforms: reasons.length === 0 ? platforms : [] };
}

/**
 * Guard for the mapping write endpoints (products/categories/groups/subcategories). The admin UI disables the buttons
 * from the same definition; this makes the backend refuse what the UI would not offer.
 * @param {{ section_type?: string|null, parent_section_id?: number|null, config?: object|null }} section
 * @param {'PRODUCT'|'CATEGORY'|'GROUP'|'SUBCATEGORY'} kind
 * @returns {{ ok: boolean, error?: string }}
 */
export function assertMappingAllowed(section, kind) {
  const def = section.section_type ? getDefinition(section.section_type) : null;
  if (!def) return { ok: false, error: 'this section has no supported section_type, so it cannot have mappings' };
  if (def.isParent && section.parent_section_id == null) {
    return { ok: false, error: `${def.type} parent rows carry no mappings; map the left/right child sections instead` };
  }
  if (!def.mappings.includes(kind)) return { ok: false, error: `${def.type} does not allow ${kind} mappings` };
  if (def.type === 'PRODUCT_CAROUSEL') {
    const source = validateConfig(def.configSchema, section.config).value?.source;
    if (source !== 'MAPPED') return { ok: false, error: `source ${source} does not use mappings; set source to MAPPED first` };
  }
  return { ok: true };
}

/**
 * Validate a section write against its type's capabilities. Used by every admin write path —
 * the backend never trusts frontend validation.
 *
 * @param {Object} input
 * @param {string} input.type                   section_type
 * @param {object} [input.config]               raw config
 * @param {Record<string, number>} [input.mappings]  counts per kind, e.g. { PRODUCT: 3, CATEGORY: 0 }
 * @param {string[]} [input.platforms]
 * @param {string} [input.loadMode]
 * @param {{ parentType?: string|null, slot?: string|null }} [input.placement]  set when the row is a pair child
 * @returns {{ ok: boolean, config: object, errors: string[] }}
 */
export function validateSection({ type, config, mappings = {}, platforms, loadMode, placement } = {}) {
  const errors = [];
  const def = getDefinition(type);
  if (!def) return { ok: false, config: {}, errors: [`unknown section_type "${type}"`] };

  const cfg = validateConfig(def.configSchema, config);
  errors.push(...cfg.errors);

  for (const [kind, count] of Object.entries(mappings)) {
    if (!MAPPING_KINDS.includes(kind)) { errors.push(`unknown mapping kind "${kind}"`); continue; }
    if (count > 0 && !def.mappings.includes(kind)) errors.push(`${type} does not allow ${kind} mappings`);
  }

  if (platforms !== undefined) {
    if (!Array.isArray(platforms) || platforms.length === 0) errors.push('platforms must be a non-empty array');
    else {
      for (const p of platforms) {
        if (!PLATFORMS.includes(p)) errors.push(`unknown platform "${p}"`);
        else if (!def.platforms.includes(p)) errors.push(`${type} cannot render on ${p}`);
      }
    }
  }

  if (loadMode !== undefined && !LOAD_MODES.includes(loadMode)) errors.push(`load_mode must be one of: ${LOAD_MODES.join(', ')}`);

  if (placement && (placement.parentType || placement.slot)) {
    if (!placement.parentType || !getDefinition(placement.parentType)?.isParent) errors.push('parent section must be a pair (DUAL_CATEGORY_PAIR) section');
    if (!['left', 'right'].includes(placement.slot)) errors.push('slot must be "left" or "right"');
  }

  if (cfg.ok && def.validate) errors.push(...def.validate({ config: cfg.value, mappings }));

  return { ok: errors.length === 0, config: cfg.value, errors };
}

/**
 * INITIAL vs DEFERRED decision (plan §10): explicit load_mode wins; AUTO uses the type default,
 * plus a position budget so the first N top-level sections are always eager.
 *
 * @param {{ load_mode?: string, section_type: string }} section
 * @param {number} position 1-based position among the top-level feed sections
 * @param {number} initialCount HOMEPAGE_INITIAL_COUNT
 */
export function resolveLoad(section, position, initialCount) {
  if (section.load_mode === 'INITIAL') return 'INITIAL';
  if (section.load_mode === 'DEFERRED') return 'DEFERRED';
  const def = getDefinition(section.section_type);
  if (!def) return 'DEFERRED';
  return def.defaultLoad === 'INITIAL' || position <= initialCount ? 'INITIAL' : 'DEFERRED';
}
