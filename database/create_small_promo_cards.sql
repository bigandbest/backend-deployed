-- Create small_promo_cards table
CREATE TABLE IF NOT EXISTS small_promo_cards (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    link TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger for updating timestamp
DROP TRIGGER IF EXISTS update_small_promo_cards_updated_at ON small_promo_cards;
CREATE TRIGGER update_small_promo_cards_updated_at
    BEFORE UPDATE ON small_promo_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_small_promo_cards_is_active ON small_promo_cards(is_active);
CREATE INDEX IF NOT EXISTS idx_small_promo_cards_display_order ON small_promo_cards(display_order);

-- Display created table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'small_promo_cards';
