-- Product Sections Seed File
-- This file creates the product_sections table and seeds it with initial data

-- Drop table if exists (use with caution in production)
-- DROP TABLE IF EXISTS product_sections;

-- Create product_sections table
CREATE TABLE IF NOT EXISTS product_sections (
    id SERIAL PRIMARY KEY,
    section_key VARCHAR(100) NOT NULL UNIQUE,
    section_name VARCHAR(200) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    component_name VARCHAR(200),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_product_sections_updated_at ON product_sections;
CREATE TRIGGER update_product_sections_updated_at
    BEFORE UPDATE ON product_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Clear existing data (optional - uncomment if you want to reset)
-- TRUNCATE TABLE product_sections RESTART IDENTITY CASCADE;

-- Insert seed data for all product sections
INSERT INTO product_sections (section_key, section_name, is_active, display_order, component_name, description) VALUES
    ('quick_access', 'Quick Access', true, 1, 'QuickAccess', 'Quick navigation shortcuts for common actions'),
    ('hero_section', 'Hero Section', true, 2, 'HeroSection', 'Main banner/hero section of the homepage'),
    ('quick_picks', 'Quick Picks', true, 3, 'QuickPicks', 'Curated selection of popular items'),
    ('shop_by_store', 'Shop By Store', true, 4, 'ShopByStore', 'Browse products organized by different stores'),
    ('daily_deals', 'Daily Deals', true, 5, 'DailyDeals', 'Special offers and deals updated daily'),
    ('shop_by_category', 'Shop By Category', true, 6, 'ShopByCategory', 'Browse products organized by categories'),
    ('promo_banner', 'Promo Banner', true, 7, 'PromoBanner', 'Promotional banners and advertisements'),
    ('price_zone', 'Price Zone', true, 8, 'PriceZone', 'Products organized by price ranges'),
    ('brand_vista', 'Brand Vista', true, 9, 'BrandVista', 'Showcase of different brands and their products'),
    ('dual_deals', 'Dual Deals', true, 10, 'DualDeals', 'Buy one get one and combo deals'),
    ('video_card_section', 'Video Cards', true, 11, 'VideoCardSection', 'Interactive video content and product showcases'),
    ('mega_monsoon', 'Mega Monsoon', true, 12, 'MegaMonsoon', 'Seasonal mega sale section'),
    ('discount_corner', 'Discount Corner', true, 13, 'DiscountCorner', 'Heavily discounted products section'),
    ('product_sections_group', 'Product Sections Group', true, 14, 'ProductSectionsGroup', 'Grouped product sections display'),
    ('featured_products', 'Featured Products', true, 15, 'FeaturedProducts', 'Hand-picked featured products'),
    ('popular_products', 'Popular Products', true, 16, 'PopularProducts', 'Most popular and trending products'),
    ('recommended_products', 'Recommended Products', true, 17, 'RecommendedProducts', 'AI-powered product recommendations'),
    ('special_offers', 'Special Offers', true, 18, 'SpecialOffers', 'Limited time special offers and promotions'),
    ('limited_edition', 'Limited Edition', true, 19, 'LimitedEdition', 'Exclusive limited edition products'),
    ('top_products', 'Top Products', true, 20, 'TopProducts', 'Highly rated and best selling products'),
    ('weekly_deal', 'Weekly Deal', false, 21, 'WeeklyDeal', 'Weekly special deals and offers'),
    ('blog', 'Blog', false, 22, 'Blog', 'Blog posts and articles section'),
    ('customer_reviews', 'Customer Reviews', true, 23, 'CustomerReviews', 'Customer testimonials and reviews'),
    ('brand_partners', 'Brand Partners', true, 24, 'BrandPartners', 'Our brand partners and collaborations'),
    ('dual_deals_left', 'Dual Deals - Best Selling (Left)', true, 25, 'DualDeals', 'Left panel of Dual Deals section - displays subcategories from mapped category'),
    ('dual_deals_right', 'Dual Deals - Trending (Right)', true, 26, 'DualDeals', 'Right panel of Dual Deals section - displays subcategories from mapped category'),
    ('discount_corner_left', 'Discount Corner - Left Panel', true, 27, 'DiscountCorner', 'Left panel of Discount Corner section - displays subcategories from mapped category'),
    ('discount_corner_right', 'Discount Corner - Right Panel', true, 28, 'DiscountCorner', 'Right panel of Discount Corner section - displays subcategories from mapped category'),
    ('bigbestmart_deals', 'BigBestMart Deals', true, 29, 'BigBestMartDeals', 'Premium products at unbeatable prices - Limited time offers'),
    ('new_arrivals', 'New Arrivals', true, 30, 'NewArrivals', 'Latest products and newest additions to our catalog'),
    ('everyday_essentials', 'Everyday Essentials', true, 31, 'EverydayEssentials', 'Daily essential products for your home')
ON CONFLICT (section_key) DO UPDATE SET
    section_name = EXCLUDED.section_name,
    component_name = EXCLUDED.component_name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_sections_section_key ON product_sections(section_key);
CREATE INDEX IF NOT EXISTS idx_product_sections_is_active ON product_sections(is_active);
CREATE INDEX IF NOT EXISTS idx_product_sections_display_order ON product_sections(display_order);
CREATE INDEX IF NOT EXISTS idx_product_sections_active_order ON product_sections(is_active, display_order);

-- Display the inserted data
SELECT 
    id,
    section_key,
    section_name,
    is_active,
    display_order,
    component_name
FROM product_sections 
ORDER BY display_order;

-- Summary statistics
SELECT 
    COUNT(*) as total_sections,
    COUNT(*) FILTER (WHERE is_active = true) as active_sections,
    COUNT(*) FILTER (WHERE is_active = false) as inactive_sections
FROM product_sections;