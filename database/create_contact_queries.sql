-- Create contact_queries table
CREATE TABLE IF NOT EXISTS contact_queries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Contacted, Resolved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- status index for faster filtering
CREATE INDEX IF NOT EXISTS idx_contact_queries_status ON contact_queries(status);
