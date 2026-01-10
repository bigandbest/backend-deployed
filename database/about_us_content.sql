-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create about_us_content table
CREATE TABLE IF NOT EXISTS about_us_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  banner_image_url TEXT,
  title VARCHAR(255) DEFAULT 'About Our Company',
  subtitle VARCHAR(255) DEFAULT 'About Big&Best',
  heading VARCHAR(255) DEFAULT 'Big&Best Mart',
  content TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Initial Seed Data with Enhanced Content
INSERT INTO about_us_content (banner_image_url, title, subtitle, heading, content)
SELECT 
  '/about-image.jpg',
  'About Our Company',
  'About Big&Best',
  'Big&Best Mart',
  'Welcome to Big&Best Mart, where we are redefining the landscape of modern retail and convenience. We are not just another e-commerce platform; we are a comprehensive service ecosystem designed to integrate seamlessly into your daily life, providing speed, reliability, and quality at every touchpoint.

Our mission is to bridge the gap between traditional grocery shopping and the digital age. We understand that in today''s fast-paced world, time is your most valuable asset. That is why we have engineered an ultra-fast delivery service that ensures your groceries, daily essentials, and household products reach your doorstep in minutes, not hours. Whether it’s fresh farm produce, dairy, or pantry staples, our robust logistics network guarantees freshness and timeliness.

But we go beyond groceries. Our platform features the **EATO** section, a dedicated culinary marketplace that rivals the best food delivery apps. Craving a quick snack or a full course meal? EATO connects you with top local eateries and cloud kitchens, delivering hot and fresh food with the same speed and efficiency you expect from Big&Best.

For our business partners and bulk buyers, we introduce the **Bazar** section. This robust marketplace functions like a premier B2B platform, connecting retailers, wholesalers, and small businesses with trusted suppliers. Whether you are stocking up for your store or sourcing materials for your enterprise, Bazar offers diverse categories, competitive wholesale pricing, and a transparent procurement process.

At Big&Best Mart, trust is our currency. We have forged strong collaborations with India''s most trusted brands and certified suppliers to bring you authentic products. Our commitment to quality is unwavering, backed by industry-leading certifications and rigorous food safety standards. Every product that leaves our warehouse undergoes strict quality checks to ensure it meets our high standards.

Join millions of satisfied customers who have made Big&Best Mart their go-to destination for all their daily needs. Experience the future of shopping where convenience meets quality. Fresh. Fast. Authentic. Reliable. Welcome to the Big&Best family.'
WHERE NOT EXISTS (SELECT 1 FROM about_us_content);

COMMENT ON TABLE about_us_content IS 'Stores dynamic content for the About Us page';
