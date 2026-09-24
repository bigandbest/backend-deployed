// Shared validation for the mapping write endpoints (products / categories / groups). The backend refuses what the
// admin UI would not offer (capability comes from registry/definitions.js) and turns "bad id" into a 4xx, never a 500.
import { assertMappingAllowed } from './registry/index.js';
import { MappingRequestError } from './errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT4_MAX = 2147483647;

export const parseSectionId = (raw) => {
  if (!/^\d+$/.test(String(raw ?? '')) || Number(raw) > INT4_MAX) {
    throw new MappingRequestError(404, 'SECTION_NOT_FOUND', 'Product section not found');
  }
  return Number(raw);
};

/** Loads the section and verifies its type allows `kind` mappings. 404 unknown section, 400 not allowed. */
export async function loadMappableSection(prisma, rawId, kind) {
  const id = parseSectionId(rawId);
  const section = await prisma.product_sections.findUnique({
    where: { id },
    select: { id: true, section_key: true, section_type: true, parent_section_id: true, config: true },
  });
  if (!section) throw new MappingRequestError(404, 'SECTION_NOT_FOUND', 'Product section not found');
  const check = assertMappingAllowed(section, kind);
  if (!check.ok) throw new MappingRequestError(400, 'MAPPING_NOT_ALLOWED', check.error);
  return section;
}

/** Validates a non-empty array of UUIDs (400) and that every id exists in `model` (404 listing the missing ones). */
export async function assertIdsExist(prisma, model, ids, label) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new MappingRequestError(400, 'INVALID_REQUEST', `${label} must be a non-empty array`);
  }
  const bad = ids.filter((v) => typeof v !== 'string' || !UUID.test(v));
  if (bad.length) throw new MappingRequestError(400, 'INVALID_ID', `${label} must be UUIDs`, { invalid: bad.slice(0, 20) });
  const unique = [...new Set(ids.map((v) => v.toLowerCase()))];
  const found = await prisma[model].findMany({ where: { id: { in: unique } }, select: { id: true } });
  const foundSet = new Set(found.map((r) => r.id));
  const missing = unique.filter((v) => !foundSet.has(v));
  if (missing.length) throw new MappingRequestError(404, `${label.toUpperCase().replace(/S$/, '')}_NOT_FOUND`, `some ${label} do not exist`, { missing });
  return unique;
}

export const assertUuid = (value, label) => {
  if (typeof value !== 'string' || !UUID.test(value)) throw new MappingRequestError(400, 'INVALID_ID', `${label} must be a UUID`);
  return value.toLowerCase();
};
