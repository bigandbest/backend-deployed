import test from 'node:test';
import assert from 'node:assert/strict';
import { createSectionService, SectionValidationError } from '../../services/homepage/SectionService.js';

function fakePrisma(row, counts = {}) {
  const audits = [];
  let updated = null;
  const count = (k) => async () => counts[k] ?? 0;
  return {
    audits, get updated() { return updated; },
    product_sections: {
      findUnique: async ({ where }) => (where.id === row.id ? row : where.id === row.parent_section_id ? { section_type: 'DUAL_CATEGORY_PAIR' } : null),
      update: async ({ data }) => (updated = { ...row, ...data }),
    },
    product_section_products: { count: count('PRODUCT') }, product_section_categories: { count: count('CATEGORY') },
    product_section_groups: { count: count('GROUP') }, section_subcategory_mappings: { count: count('SUBCATEGORY') },
    section_audit_log: { create: async ({ data }) => { audits.push(data); return data; } },
    $transaction: async (ops) => Promise.all(ops),
  };
}
const base = { id: 7, section_key: 'featured', section_name: 'Featured', section_type: 'PRODUCT_CAROUSEL', config: { source: 'MAPPED', limit: 20 }, config_version: 3, is_active: true, platforms: ['web', 'mobile'], load_mode: 'AUTO' };

test('valid config: validated, version bumped, audited with diff and actor', async () => {
  const p = fakePrisma(base);
  const svc = createSectionService({ prisma: p });
  const out = await svc.updateSection(7, { config: { source: 'MAPPED', limit: 12 }, section_key: 'hack', section_type: 'TESTIMONIALS' }, { id: 'a1', role: 'admin' });
  assert.equal(out.config.limit, 12);
  assert.equal(out.config_version, 4);
  assert.equal(out.section_key, 'featured', 'immutable fields ignored');
  assert.equal(out.section_type, 'PRODUCT_CAROUSEL');
  assert.equal(p.audits[0].action, 'SECTION_CONFIG_CHANGED');
  assert.equal(p.audits[0].actor_id, 'a1');
  assert.equal(p.audits[0].diff.config.to.limit, 12);
});

test('invalid config / platform / load_mode / mapping conflicts are rejected and nothing is written', async () => {
  for (const body of [{ config: { source: 'NOPE' } }, { config: { limit: 9999 } }, { platforms: ['tv'] }, { load_mode: 'SOON' }]) {
    const p = fakePrisma(base);
    await assert.rejects(createSectionService({ prisma: p }).updateSection(7, body), SectionValidationError);
    assert.equal(p.updated, null); assert.equal(p.audits.length, 0);
  }
  const p = fakePrisma(base, { PRODUCT: 3 });
  await assert.rejects(createSectionService({ prisma: p }).updateSection(7, { config: { source: 'SUPER_SAVER' } }), /mappings/i, 'non-MAPPED source with pinned products is rejected');
});

test('no-op writes create no audit row; missing section returns null; untyped section cannot take homepage settings', async () => {
  const p = fakePrisma(base);
  const svc = createSectionService({ prisma: p });
  assert.equal(await svc.updateSection(7, { section_name: 'Featured' }), base);
  assert.equal(p.audits.length, 0);
  assert.equal(await svc.updateSection(99, { section_name: 'x' }), null);
  const untyped = fakePrisma({ ...base, section_type: null });
  await assert.rejects(createSectionService({ prisma: untyped }).updateSection(7, { config: {} }), SectionValidationError);
});

test('legacy-only edits (name/active) still work without registry validation', async () => {
  const p = fakePrisma(base);
  const out = await createSectionService({ prisma: p }).updateSection(7, { section_name: 'New', is_active: false });
  assert.equal(out.section_name, 'New');
  assert.equal(p.audits[0].action, 'SECTION_TOGGLED');
});
