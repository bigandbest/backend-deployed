-- Drop existing table if it exists (to change user_id type)
DROP TABLE IF EXISTS cod_orders;

-- Create COD Orders table with UUID support
CREATE TABLE cod_orders (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    product_id TEXT NOT NULL, -- Can store multiple product IDs
    user_name VARCHAR(255) NOT NULL,
    user_email VARCHAR(255),
    product_name TEXT NOT NULL, -- Can store multiple product names
    product_total_price DECIMAL(10,2) NOT NULL,
    user_address TEXT NOT NULL,
    user_location VARCHAR(255),
    quantity INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cod_orders_user_id ON cod_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_cod_orders_status ON cod_orders(status);
CREATE INDEX IF NOT EXISTS idx_cod_orders_created_at ON cod_orders(created_at);

-- Insert sample data for testing (using UUID)
INSERT INTO cod_orders (user_id, product_id, user_name, user_email, product_name, product_total_price, user_address, user_location, quantity) VALUES
(gen_random_uuid(), 'prod-001', 'Test User', 'test@example.com', 'Sample Product 1', 1200.00, '123 Test Street, Test City', 'Test Location', 2),
(gen_random_uuid(), 'prod-002', 'Test User', 'test@example.com', 'Sample Product 2', 1500.00, '123 Test Street, Test City', 'Test Location', 1),
(gen_random_uuid(), 'prod-003', 'John Doe', 'john@example.com', 'Sample Product 3', 2000.00, '456 Main Street, City', 'Main Location', 3);