import { SECTION_DEFINITIONS, MAPPING_KINDS, LOAD_MODES, PLATFORMS } from './definitions.js';
import { validateConfig, describeSchema } from './schema.js';

export { MAPPING_KINDS, LOAD_MODES, PLATFORMS };

export const SECTION_KEY_PATTERN = /^[a-z0-9_]{3,100}$/;

export const getDefinition = (type) =>
  Object.prototype.hasOwnProperty.call(SECTION_DEFINITIONS, type) ? SECTION_DEFINITIONS[type] : null;

export const listTypes = () => Object.keys(SECTION_DEFINITIONS);

/** Registry metadata for the admin UI (drives which mapping tabs / config inputs are shown). */
export const describeTypes = () =>
  Object.values(SECTION_DEFINITIONS).map((d) => ({
    type: d.type,
    label: d.label,
    mappings: d.mappings,
    defaultLoad: d.defaultLoad,
    platforms: d.platforms,
    isParent: d.isParent,
    usesProducts: d.usesProducts,
    config: describeSchema(d.configSchema),
  }));

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
