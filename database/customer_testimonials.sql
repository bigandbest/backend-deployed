-- Create customer_testimonials table for managing customer reviews/testimonials
-- This table stores customer testimonials displayed on the homepage

CREATE TABLE IF NOT EXISTS customer_testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  image_url TEXT,
  comment TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries on active testimonials
CREATE INDEX IF NOT EXISTS idx_customer_testimonials_active ON customer_testimonials(active);

-- Create index for sorting
CREATE INDEX IF NOT EXISTS idx_customer_testimonials_sort ON customer_testimonials(sort_order, created_at);

-- Add comment to table
COMMENT ON TABLE customer_testimonials IS 'Stores customer testimonials/reviews displayed on the homepage';

-- Add comments to columns
COMMENT ON COLUMN customer_testimonials.id IS 'Unique identifier for the testimonial';
COMMENT ON COLUMN customer_testimonials.name IS 'Customer name';
COMMENT ON COLUMN customer_testimonials.rating IS 'Star rating (1-5)';
COMMENT ON COLUMN customer_testimonials.image_url IS 'Optional URL to customer image';
COMMENT ON COLUMN customer_testimonials.comment IS 'Customer testimonial text';
COMMENT ON COLUMN customer_testimonials.active IS 'Whether the testimonial is active/visible';
COMMENT ON COLUMN customer_testimonials.sort_order IS 'Display order (lower numbers first)';
COMMENT ON COLUMN customer_testimonials.created_at IS 'Timestamp when testimonial was created';
COMMENT ON COLUMN customer_testimonials.updated_at IS 'Timestamp when testimonial was last updated';

-- Insert sample testimonials (optional - remove if you want to start fresh)
INSERT INTO customer_testimonials (name, rating, image_url, comment, active, sort_order) VALUES
('Rishabh Rawat', 5, '', 'Absolutely loved the product! The quality exceeded my expectations and the customer service was prompt and helpful. I''ve already recommended it to several friends and family members. Will definitely purchase again!', true, 1),
('Aarav Mehta', 4, '', 'Overall, I''m quite happy with my experience. The ordering process was smooth and the delivery was faster than expected. However, the packaging could be improved to make the unboxing feel a bit more premium.', true, 2),
('Sneha Kapoor', 5, '', 'This was my first purchase from the site, and I''m genuinely impressed. The product looks and feels high quality, and the attention to detail is evident. It arrived well-packed and on time. Highly recommend it!', true, 3)
ON CONFLICT DO NOTHING;

-- Success message
SELECT 'customer_testimonials table created successfully!' as message;
