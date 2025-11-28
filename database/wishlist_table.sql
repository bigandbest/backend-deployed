-- Create wishlist table
CREATE TABLE IF NOT EXISTS wishlist (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT unique_user_product UNIQUE (user_id, product_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_product_id ON wishlist(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_created_at ON wishlist(created_at DESC);

-- Enable Row Level Security
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own wishlist
CREATE POLICY "Users can view their own wishlist" ON wishlist
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert into their own wishlist
CREATE POLICY "Users can insert into their own wishlist" ON wishlist
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete from their own wishlist
CREATE POLICY "Users can delete from their own wishlist" ON wishlist
    FOR DELETE USING (auth.uid() = user_id);
