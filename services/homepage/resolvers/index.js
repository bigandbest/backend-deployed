// Section resolvers — one per section_type, each BATCH-per-type: it receives every section of its type so
// shared reads (categories, banners of one type) happen once. Resolvers do IO only through `deps`; they never
// touch the cache layer, HTTP, ordering, platform filtering or availability (the assembler owns those).
//
// makeCategoryLoader below is a plain DB query with no cache awareness by design (this module must stay
// importable in tests without opening a Redis connection — see cache/cachedDeps.js's own note on that). The
// composition root (index.js) wraps it with cachedCategoryLoader for cross-request Redis caching.
//
// Contract:  resolver({ ctx, sections, plan, deps }) -> Promise<Map<sectionId, { data: object|null, empty?: boolean }>>
//   sections : registry-normalised rows ({ id, section_key, config (validated+defaulted), children? ... })
//   deps     : { prisma, store: EntityStore, selection: Map<sectionId,string[]>, products: Map<id,HomepageProduct>, getCategories }
// A thrown error marks every section of that type as status:'ERROR' (the rest of the feed is unaffected).

const NOT_INACTIVE = { OR: [{ active: true }, { active: null }] }; // add_banner.active is nullable, null == active (clients: active !== false)

const banner = (b) => ({
  id: b.id,
  name: b.name ?? null,
  description: b.description ?? null,
  bannerType: b.banner_type ?? null,
  imageUrl: b.image_url ?? null,
  link: b.link ?? null,
  position: b.position ?? null,
});

const forAll = (sections, fn) => new Map(sections.map((s) => [s.id, fn(s)]));
const wrap = (arr) => ({ data: arr.data, empty: arr.empty ?? (arr.list ?? []).length === 0 });

// ── banners ────────────────────────────────────────────────────────────────
const bannersByType = (prisma, type) =>
  prisma.add_banner.findMany({
    where: { banner_type: type, ...NOT_INACTIVE },
    select: { id: true, name: true, description: true, banner_type: true, image_url: true, link: true, position: true },
    orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
  });

async function heroCarousel({ sections, deps }) {
  // Contract: hero banners only. No fallback to other banner types — none configured means EMPTY (section omitted).
  const rows = await bannersByType(deps.prisma, 'hero');
  const list = rows.map(banner);
  return forAll(sections, (s) => wrap({ list: list.slice(0, s.config.limit ?? 20), data: { banners: list } }));
}

async function bannerStrip({ sections, deps }) {
  // Batched like every other resolver here: at most one query per distinct bannerType,
  // never one per section, so N sections sharing a type never repeat the same query.
  const megaSections = sections.filter((s) => s.config.bannerType === 'mega_sale');
  const promoSections = sections.filter((s) => s.config.bannerType !== 'mega_sale');

  const [megaList, promoList] = await Promise.all([
    megaSections.length
      ? deps.prisma.promo_banners.findMany({
        where: { active: true },
        select: { id: true, title: true, subtitle: true, discount: true, description: true, button_text: true, bg_color: true, accent_color: true, icon: true, link: true },
        orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
      }).then((rows) => rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.subtitle, discount: r.discount, description: r.description, buttonText: r.button_text, bgColor: r.bg_color, accentColor: r.accent_color, icon: r.icon, link: r.link })))
      : [],
    promoSections.length ? bannersByType(deps.prisma, 'promo').then((rows) => rows.map(banner)) : [],
  ]);

  const out = new Map();
  for (const s of megaSections) out.set(s.id, wrap({ list: megaList, data: { banners: megaList } }));
  for (const s of promoSections) out.set(s.id, wrap({ list: promoList, data: { banners: promoList } }));
  return out;
}

async function mobileBanners({ sections, deps }) {
  const rows = await deps.prisma.add_banner.findMany({
    where: { is_mobile: true, ...NOT_INACTIVE },
    select: { id: true, name: true, description: true, banner_type: true, image_url: true, link: true, position: true },
    orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
  });
  const list = rows.map(banner);
  return forAll(sections, (s) => wrap({ list: list.slice(0, s.config.limit), data: { banners: list.slice(0, s.config.limit) } }));
}

async function promoCards({ sections, deps }) {
  const rows = await deps.prisma.small_promo_cards.findMany({
    where: { is_active: true },
    select: { id: true, image_url: true, link: true, link_type: true, resource_id: true, sub_resource_id: true },
    orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
  });
  const list = rows.map((r) => ({ id: r.id, imageUrl: r.image_url, link: r.link, linkType: r.link_type, resourceId: r.resource_id, subResourceId: r.sub_resource_id }));
  return forAll(sections, (s) => wrap({ list, data: { cards: list.slice(0, s.config.limit) } }));
}

async function videoCards({ sections, deps }) {
  const rows = await deps.prisma.video_cards.findMany({
    where: { active: true },
    select: { id: true, title: true, description: true, video_url: true, thumbnail_url: true, position: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  const list = rows.map((r) => ({ id: r.id, title: r.title, description: r.description, videoUrl: r.video_url, thumbnailUrl: r.thumbnail_url }));
  // Clients show one "mega" banner (position contains "mega") next to the videos; today they find it via /banner/all.
  const mega = await deps.prisma.add_banner.findFirst({
    where: { position: { contains: 'mega', mode: 'insensitive' }, ...NOT_INACTIVE },
    select: { id: true, name: true, description: true, banner_type: true, image_url: true, link: true, position: true },
    orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
  });
  return forAll(sections, (s) => wrap({ list, data: { videos: list.slice(0, s.config.limit), megaBanner: mega ? banner(mega) : null } }));
}

// ── small tables ───────────────────────────────────────────────────────────
async function dealCards({ sections, deps }) {
  const rows = await deps.prisma.daily_deals.findMany({
    where: { active: true },
    select: { id: true, title: true, image_url: true, discount: true, badge: true, banner: { select: { image_url: true, link: true } } },
    orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
  });
  const list = rows.map((r) => ({ id: r.id, title: r.title, imageUrl: r.image_url ?? r.banner?.image_url ?? null, discount: r.discount, badge: r.badge, link: r.banner?.link ?? null }));
  return forAll(sections, (s) => wrap({ list, data: { deals: list.slice(0, s.config.limit) } }));
}

async function brandGrid({ sections, deps }) {
  const max = Math.max(...sections.map((s) => s.config.limit));
  const rows = await deps.prisma.brand.findMany({
    where: { is_active: true },
    select: { id: true, name: true, image_url: true },
    orderBy: { name: 'asc' },
    take: max,
  });
  const list = rows.map((r) => ({ id: r.id, name: r.name, imageUrl: r.image_url }));
  return forAll(sections, (s) => wrap({ list, data: { brands: list.slice(0, s.config.limit) } }));
}

async function brandPartners({ sections, deps }) {
  const max = Math.max(...sections.map((s) => s.config.limit));
  const rows = await deps.prisma.partners.findMany({
    where: { active: true },
    select: { id: true, name: true, image_url: true },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    take: max,
  });
  const list = rows.map((r) => ({ id: r.id, name: r.name, imageUrl: r.image_url }));
  return forAll(sections, (s) => wrap({ list, data: { partners: list.slice(0, s.config.limit) } }));
}

async function storeGrid({ sections, deps }) {
  const rows = await deps.prisma.recommended_store.findMany({
    where: { is_active: true },
    select: { id: true, name: true, image_url: true, description: true, banner: { select: { image_url: true, link: true } } },
    orderBy: { name: 'asc' },
  });
  const list = rows.map((r) => ({ id: r.id, name: r.name, imageUrl: r.image_url ?? r.banner?.image_url ?? null, description: r.description, link: r.banner?.link ?? null }));
  return forAll(sections, (s) => wrap({ list, data: { stores: list.slice(0, s.config.limit) } }));
}

async function testimonials({ sections, deps }) {
  const rows = await deps.prisma.customer_testimonials.findMany({
    where: { active: true },
    select: { id: true, name: true, rating: true, image_url: true, comment: true },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'desc' }],
  });
  const list = rows.map((r) => ({ id: r.id, name: r.name, rating: r.rating, imageUrl: r.image_url, comment: r.comment }));
  return forAll(sections, (s) => wrap({ list, data: { testimonials: list.slice(0, s.config.limit) } }));
}

// ── categories (shared hierarchy, loaded once per request) ─────────────────
async function categoryGrid({ sections, plan, deps }) {
  // Contract (owner decision 2026-09-23): ONLY mapped subcategories (section_subcategory_mappings, is_active) and the
  // active categories that own them. Nothing mapped => EMPTY. Categories by name; subcategories by sort_order, name.
  const cats = await deps.getCategories();
  return forAll(sections, (s) => {
    const mapped = new Set(plan.mappings[s.id]?.SUBCATEGORY ?? []);
    const list = [];
    const subcategoryIds = [];
    for (const c of cats.values()) {
      const subs = c.subcategories.filter((x) => mapped.has(x.id));
      if (subs.length === 0) continue;
      list.push(c);
      subs.forEach((x) => subcategoryIds.push(x.id));
    }
    const limited = list.slice(0, s.config.limit);
    limited.forEach((c) => deps.store.addCategory(c));
    const keep = new Set(limited.flatMap((c) => c.subcategories.map((x) => x.id)));
    return wrap({ list: limited, data: { categoryIds: limited.map((c) => c.id), subcategoryIds: subcategoryIds.filter((id) => keep.has(id)) } });
  });
}

async function dualCategoryPair({ sections, plan, deps }) {
  const cats = await deps.getCategories();
  return forAll(sections, (s) => {
    const side = (child) => {
      // Mirrors GET /section-mappings/:key/categories?exclude_inferred=true: explicit category mappings only,
      // active categories only, ordered by name.
      const ids = child ? plan.mappings[child.id]?.CATEGORY ?? [] : [];
      const found = ids.map((id) => cats.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
      found.forEach((c) => deps.store.addCategory(c));
      return { categoryIds: found.map((c) => c.id), subcategoryIds: child ? plan.mappings[child.id]?.SUBCATEGORY ?? [] : [] };
    };
    const left = side(s.children?.left);
    const right = side(s.children?.right);
    return { data: { theme: s.config.theme, left, right }, empty: left.categoryIds.length === 0 && right.categoryIds.length === 0 };
  });
}

async function tabbedProducts({ sections, plan, deps }) {
  const allIds = [...new Set(sections.flatMap((s) => plan.mappings[s.id]?.SUBCATEGORY ?? []))];
  const subs = allIds.length
    ? await deps.prisma.subcategories.findMany({
        where: { id: { in: allIds }, active: true },
        select: { id: true, name: true, image_url: true },
      })
    : [];
  const byId = new Map(subs.map((x) => [x.id, x]));
  return forAll(sections, (s) => {
    const tabs = (plan.mappings[s.id]?.SUBCATEGORY ?? []).map((id) => byId.get(id)).filter(Boolean).slice(0, s.config.limit)
      .map((x) => ({ subcategoryId: x.id, name: x.name, imageUrl: x.image_url }));
    return wrap({ list: tabs, data: { tabs } });
  });
}

// ── products (selection + hydration happen once in the assembler) ──────────
async function productCarousel({ sections, deps }) {
  return forAll(sections, (s) => {
    const ids = (deps.selection.get(s.id) || []).filter((id) => deps.products.has(id));
    ids.forEach((id) => deps.store.addProduct(deps.products.get(id)));
    return {
      data: { productIds: ids, seeAll: s.config.showSeeAll ? { sectionKey: s.section_key, source: s.config.source } : null },
      empty: ids.length === 0,
    };
  });
}

export const RESOLVERS = {
  HERO_CAROUSEL: heroCarousel,
  BANNER_STRIP: bannerStrip,
  MOBILE_BANNERS: mobileBanners,
  PROMO_CARDS: promoCards,
  VIDEO_CARDS: videoCards,
  DEAL_CARDS: dealCards,
  BRAND_GRID: brandGrid,
  BRAND_PARTNERS: brandPartners,
  STORE_GRID: storeGrid,
  TESTIMONIALS: testimonials,
  CATEGORY_GRID: categoryGrid,
  DUAL_CATEGORY_PAIR: dualCategoryPair,
  TABBED_PRODUCTS: tabbedProducts,
  PRODUCT_CAROUSEL: productCarousel,
};

/** Shared, memoised-per-request active category hierarchy in HomepageCategory shape (plan §14). */
export function makeCategoryLoader(prisma) {
  let cached;
  return () => {
    cached ??= prisma.categories
      .findMany({
        where: { active: true },
        select: {
          id: true, name: true, image_url: true, icon: true,
          subcategories: {
            where: { active: true },
            orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true, image_url: true },
          },
        },
        orderBy: { name: 'asc' },
      })
      .then((rows) => new Map(rows.map((c) => [c.id, {
        id: c.id, name: c.name, imageUrl: c.image_url, icon: c.icon,
        subcategories: c.subcategories.map((x) => ({ id: x.id, name: x.name, imageUrl: x.image_url })),
      }])));
    return cached;
  };
}
