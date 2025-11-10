-- Bulk Orders Complete Database Schema

-- 1. Bulk Order Enquiries Table (B2B Enquiries)
CREATE TABLE IF NOT EXISTS bulk_order_enquiries (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    description TEXT,
    expected_price DECIMAL(10,2),
    delivery_timeline VARCHAR(100),
    gst_number VARCHAR(50),
    address TEXT,
    status VARCHAR(50) DEFAULT 'Pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Wholesale Bulk Orders Table (Integrated Checkout)
CREATE TABLE IF NOT EXISTS wholesale_bulk_orders (
    id SERIAL PRIMARY KEY,
    user_id UUID,
    total_price DECIMAL(10,2) NOT NULL,
    email VARCHAR(255) NOT NULL,
    contact VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    gst_number VARCHAR(50),
    
    -- Shipping Address
    shipping_first_name VARCHAR(100),
    shipping_last_name VARCHAR(100),
    shipping_full_address TEXT,
    shipping_apartment VARCHAR(100),
    shipping_city VARCHAR(100),
    shipping_country VARCHAR(100),
    shipping_state VARCHAR(100),
    shipping_zip_code VARCHAR(20),
    
    -- Billing Address
    billing_first_name VARCHAR(100),
    billing_last_name VARCHAR(100),
    billing_full_address TEXT,
    billing_apartment VARCHAR(100),
    billing_city VARCHAR(100),
    billing_country VARCHAR(100),
    billing_state VARCHAR(100),
    billing_zip_code VARCHAR(20),
    
    -- Order Status
    order_status VARCHAR(50) DEFAULT 'pending',
    payment_status VARCHAR(50) DEFAULT 'PAYMENT_PENDING',
    is_deleted BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Wholesale Bulk Order Items Table
CREATE TABLE IF NOT EXISTS wholesale_bulk_order_items (
    id SERIAL PRIMARY KEY,
    wholesale_bulk_order_id INTEGER REFERENCES wholesale_bulk_orders(id) ON DELETE CASCADE,
    product_id VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    is_bulk_order BOOLEAN DEFAULT TRUE,
    bulk_range VARCHAR(100),
    original_price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Update existing orders table to support bulk orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_bulk_order BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bulk_order_type VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_number VARCHAR(50);

-- 5. Update existing order_items table to support bulk items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_bulk_order BOOLEAN DEFAULT FALSE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS bulk_range VARCHAR(100);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bulk_enquiries_status ON bulk_order_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_bulk_enquiries_created ON bulk_order_enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_status ON wholesale_bulk_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_wholesale_orders_user ON wholesale_bulk_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_items_order ON wholesale_bulk_order_items(wholesale_bulk_order_id);

-- Insert sample data for testing
INSERT INTO bulk_order_enquiries (company_name, contact_person, email, phone, product_name, quantity, description, expected_price, delivery_timeline, gst_number, address) VALUES
('ABC Corp', 'John Doe', 'john@abccorp.com', '9876543210', 'Bulk Rice', 1000, 'Need bulk rice for corporate cafeteria', 50000.00, '2 weeks', '22AAAAA0000A1Z5', '123 Business Park, Mumbai'),
('XYZ Ltd', 'Jane Smith', 'jane@xyzltd.com', '9876543211', 'Bulk Oil', 500, 'Cooking oil for restaurant chain', 25000.00, '1 week', '27BBBBB1111B2Y6', '456 Commercial Street, Delhi');

-- Sample wholesale bulk order (using UUID for user_id)
INSERT INTO wholesale_bulk_orders (user_id, total_price, email, contact, company_name, gst_number, shipping_first_name, shipping_last_name, shipping_full_address, shipping_city, shipping_state, shipping_zip_code, shipping_country) VALUES
(gen_random_uuid(), 75000.00, 'bulk@company.com', '9876543212', 'Bulk Buyers Inc', '29CCCCC2222C3X7', 'Bulk', 'Manager', '789 Warehouse District', 'Bangalore', 'Karnataka', '560001', 'India');