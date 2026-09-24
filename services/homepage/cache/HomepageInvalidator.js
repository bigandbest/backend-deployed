// Event-driven invalidation (plan §25). Called AFTER the DB write commits. Never throws, never fails a request;
// TTLs (plan 300s, selection 300s, product 60s, view 300s) are the fallback if an emitter is missed.
//
// | Event                                   | Deleted                                              |
// |-----------------------------------------|------------------------------------------------------|
// | SECTION_CHANGED {sectionId?}            | plan; sel+view of that section (all sections if id unknown) |
// | CATEGORY_UPDATED / GROUP_UPDATED        | plan; category hierarchy (hp:cats); every product-section selection |
// | PRODUCT_UPDATED {productId?}            | that product's card projection; every selection      |
// | BANNER/DEAL/STORE/VIDEO/PROMO/TESTIMONIAL/BRAND_UPDATED | view of the affected section TYPES only |

import { homepagePlanKey, homepageSelectionKey, homepageProductKey, homepageSectionViewKey, homepageCategoriesKey } from '../../../lib/cacheKeys.js';
import { logEvent } from '../observability.js';

export const EVENT_SECTION_TYPES = {
  BANNER_UPDATED: ['HERO_CAROUSEL', 'BANNER_STRIP', 'MOBILE_BANNERS'],
  DAILY_DEAL_UPDATED: ['DEAL_CARDS'],
  STORE_UPDATED: ['STORE_GRID'],
  VIDEO_UPDATED: ['VIDEO_CARDS'],
  PROMO_CARD_UPDATED: ['PROMO_CARDS'],
  TESTIMONIAL_UPDATED: ['TESTIMONIALS'],
  BRAND_UPDATED: ['BRAND_GRID'],
  TABS_UPDATED: ['TABBED_PRODUCTS'],
};

const isId = (v) => v !== undefined && v !== null && /^\d{1,9}$/.test(String(v));

/**
 * @param {{ prisma: object, del: (...keys:string[]) => Promise<void>, log?: Function }} deps
 */
export function createHomepageInvalidator({ prisma, del, log = logEvent }) {
  const sectionIds = async (where) =>
    (await prisma.product_sections.findMany({ where, select: { id: true } })).map((s) => s.id);

  let warehouseIds = { at: 0, ids: [] };
  const warehouses = async () => {
    if (Date.now() - warehouseIds.at > 300000) {
      warehouseIds = { at: Date.now(), ids: (await prisma.warehouses.findMany({ select: { id: true } })).map((w) => w.id) };
    }
    return warehouseIds.ids;
  };

  async function keysFor(event, payload = {}) {
    const keys = [];
    if (event === 'SECTION_CHANGED') {
      keys.push(homepagePlanKey());
      const ids = isId(payload.sectionId) ? [Number(payload.sectionId)] : await sectionIds({});
      for (const id of ids) keys.push(homepageSelectionKey(id), homepageSectionViewKey(id));
    } else if (event === 'CATEGORY_UPDATED' || event === 'GROUP_UPDATED') {
      // hp:cats:v1 holds the shared category/subcategory hierarchy (CATEGORY_GRID, DUAL_CATEGORY_PAIR) and was never
      // invalidated before — a category/subcategory edit stayed invisible for the whole 300s TTL.
      keys.push(homepagePlanKey(), homepageCategoriesKey());
      for (const id of await sectionIds({ section_type: 'PRODUCT_CAROUSEL' })) keys.push(homepageSelectionKey(id));
    } else if (event === 'PRODUCT_UPDATED') {
      for (const id of await sectionIds({ section_type: 'PRODUCT_CAROUSEL' })) keys.push(homepageSelectionKey(id));
      if (payload.productId) {
        for (const wh of [0, ...(await warehouses())]) keys.push(homepageProductKey(wh, payload.productId));
      }
    } else if (EVENT_SECTION_TYPES[event]) {
      for (const id of await sectionIds({ section_type: { in: EVENT_SECTION_TYPES[event] } })) keys.push(homepageSectionViewKey(id));
    }
    return keys;
  }

  return {
    keysFor,
    async emit(event, payload = {}) {
      try {
        const keys = await keysFor(event, payload);
        if (keys.length) await del(...keys);
        log('homepage.invalidate', { event, keysDeleted: keys.length, ...(isId(payload.sectionId) ? { sectionId: Number(payload.sectionId) } : {}) });
      } catch (err) {
        log('homepage.invalidate.error', { event, message: err.message }, 'warn');
      }
    },
  };
}
