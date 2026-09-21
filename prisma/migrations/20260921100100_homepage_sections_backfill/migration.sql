-- Homepage feed v2 — M2 BACKFILL (idempotent data migration; existing columns other than the two
-- documented is_active/display_order updates below are untouched).
-- Take a snapshot first:  \copy (SELECT * FROM product_sections) TO 'product_sections.pre-m2.csv' CSV HEADER
-- Rollback: UPDATE the new columns back to defaults (see bottom); component_name is never modified.

-- 1. section_type from the legacy component_name (deterministic; unknown names stay NULL = not deliverable)
UPDATE "product_sections" SET "section_type" = CASE "component_name"
  WHEN 'HeroSection'         THEN 'HERO_CAROUSEL'
  WHEN 'ShopByCategory'      THEN 'CATEGORY_GRID'
  WHEN 'DualDeals'           THEN 'DUAL_CATEGORY_PAIR'
  WHEN 'DiscountCorner'      THEN 'DUAL_CATEGORY_PAIR'
  WHEN 'QuickPicks'          THEN 'PRODUCT_CAROUSEL'
  WHEN 'NewArrivals'         THEN 'PRODUCT_CAROUSEL'
  WHEN 'BigBestMartDeals'    THEN 'PRODUCT_CAROUSEL'
  WHEN 'EverydayEssentials'  THEN 'PRODUCT_CAROUSEL'
  WHEN 'RecommendedProducts' THEN 'PRODUCT_CAROUSEL'
  WHEN 'FeaturedProducts'    THEN 'PRODUCT_CAROUSEL'
  WHEN 'LimitedEdition'      THEN 'PRODUCT_CAROUSEL'
  WHEN 'SpecialOffers'       THEN 'PRODUCT_CAROUSEL'
  WHEN 'TopProducts'         THEN 'PRODUCT_CAROUSEL'
  WHEN 'PopularProducts'     THEN 'PRODUCT_CAROUSEL'
  WHEN 'BestSeller'          THEN 'PRODUCT_CAROUSEL'
  WHEN 'TrendingProducts'    THEN 'PRODUCT_CAROUSEL'
  WHEN 'DailyDeals'          THEN 'DEAL_CARDS'
  WHEN 'BrandVista'          THEN 'BRAND_GRID'
  WHEN 'ShopByStore'         THEN 'STORE_GRID'
  WHEN 'VideoCardSection'    THEN 'VIDEO_CARDS'
  WHEN 'PromoBanner'         THEN 'BANNER_STRIP'
  WHEN 'DynamicMegaSale'     THEN 'BANNER_STRIP'
  WHEN 'SmallPromoCards'     THEN 'PROMO_CARDS'
  WHEN 'MegaMonsoon'         THEN 'TABBED_PRODUCTS'
  WHEN 'CustomerReviews'     THEN 'TESTIMONIALS'
  WHEN 'MobileBanners'       THEN 'MOBILE_BANNERS'
  ELSE NULL END
WHERE "section_type" IS NULL;

-- 2. Non-mapped product carousels carry their data source in config
UPDATE "product_sections" SET "config" = '{"source":"SUPER_SAVER","limit":12}'::jsonb
  WHERE "component_name" = 'QuickPicks'  AND "config" = '{}'::jsonb;
UPDATE "product_sections" SET "config" = '{"source":"NEW_ARRIVALS","limit":20}'::jsonb
  WHERE "component_name" = 'NewArrivals' AND "config" = '{}'::jsonb;
UPDATE "product_sections" SET "config" = '{"source":"MAPPED","limit":20}'::jsonb
  WHERE "section_type" = 'PRODUCT_CAROUSEL' AND "config" = '{}'::jsonb;
UPDATE "product_sections" SET "config" = '{"theme":"dual"}'::jsonb
  WHERE "component_name" = 'DualDeals' AND "config" = '{}'::jsonb;
UPDATE "product_sections" SET "config" = '{"theme":"discount"}'::jsonb
  WHERE "component_name" = 'DiscountCorner' AND "config" = '{}'::jsonb;

-- 3. Left/right children of the pair sections (resolved by section_key, never by hard-coded id)
UPDATE "product_sections" c SET "parent_section_id" = p."id", "slot" = 'left'
  FROM "product_sections" p WHERE c."section_key" = 'dual_deals_left'      AND p."section_key" = 'dual_deals'      AND c."parent_section_id" IS NULL;
UPDATE "product_sections" c SET "parent_section_id" = p."id", "slot" = 'right'
  FROM "product_sections" p WHERE c."section_key" = 'dual_deals_right'     AND p."section_key" = 'dual_deals'      AND c."parent_section_id" IS NULL;
UPDATE "product_sections" c SET "parent_section_id" = p."id", "slot" = 'left'
  FROM "product_sections" p WHERE c."section_key" = 'discount_corner_left'  AND p."section_key" = 'discount_corner' AND c."parent_section_id" IS NULL;
UPDATE "product_sections" c SET "parent_section_id" = p."id", "slot" = 'right'
  FROM "product_sections" p WHERE c."section_key" = 'discount_corner_right' AND p."section_key" = 'discount_corner' AND c."parent_section_id" IS NULL;

-- 4. Sections that are not homepage feed content
--    PriceZone: global nav strip rendered by web ClientLayout. Others: no renderer on either app.
UPDATE "product_sections" SET "show_on_home" = FALSE
  WHERE "component_name" IN ('PriceZone','QuickAccess','ProductSectionsGroup','WeeklyDeal','Blog','BrandPartners');

-- 5. Initial vs deferred (explicit and admin-editable; mirrors today's eager web set + top-of-page UI sections)
UPDATE "product_sections" SET "load_mode" = 'INITIAL'
  WHERE "section_key" IN ('hero_section','shop_by_category','discount_corner','shop_by_store','brand_vista','quick_picks','daily_deals','dual_deals')
    AND "load_mode" = 'AUTO';
UPDATE "product_sections" SET "load_mode" = 'DEFERRED'
  WHERE ("section_key" IN ('video_card_section','promo_banner','small_promo_cards','customer_reviews')
     OR "component_name" IN ('EverydayEssentials','RecommendedProducts','FeaturedProducts','LimitedEdition','SpecialOffers','TopProducts','PopularProducts','BigBestMartDeals','NewArrivals'))
    AND "load_mode" = 'AUTO';

-- 6. DECIDED (Q1): both apps force-render these today even though admin left them inactive.
--    Making the DB match preserves the visible homepage; admin can disable them afterwards.
UPDATE "product_sections" SET "is_active" = TRUE WHERE "section_key" IN ('new_arrivals','bigbestmart_deals');

-- 7. MobileBanners is client-injected today (no row) — give it a real, mobile-only row.
INSERT INTO "product_sections" ("section_key","section_name","component_name","section_type","platforms","display_order","is_active","load_mode")
  VALUES ('mobile_banners','Mobile Banners','MobileBanners','MOBILE_BANNERS', ARRAY['mobile']::TEXT[], 999, TRUE, 'DEFERRED')
  ON CONFLICT ("section_key") DO NOTHING;

-- 8. Remove display_order ties (snapshot has ties at 3, 5, 12) preserving relative order; (order, id) is now total.
UPDATE "product_sections" ps SET "display_order" = r.rn * 10
  FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY COALESCE("display_order", 0), "id") AS rn FROM "product_sections") r
  WHERE ps."id" = r."id" AND ps."display_order" IS DISTINCT FROM r.rn * 10;

-- ASSERTION (run manually after applying):
--   SELECT "section_key","component_name" FROM "product_sections" WHERE "section_type" IS NULL AND "show_on_home";   -- expect 0 rows
--
-- ROLLBACK of data (structure stays):
--   UPDATE "product_sections" SET "section_type"=NULL,"config"='{}',"parent_section_id"=NULL,"slot"=NULL,"show_on_home"=TRUE,"load_mode"='AUTO';
--   DELETE FROM "product_sections" WHERE "section_key"='mobile_banners';
--   (restore is_active/display_order from the pre-m2 CSV if needed)
