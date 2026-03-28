-- ================================================================
-- Order Fulfillment & Inventory Routing System Migration
-- ================================================================
-- Run this migration against your Supabase/PostgreSQL database
-- to create all tables and columns needed for the multi-source
-- order fulfillment system.
-- ================================================================

-- 1. Add new columns to existing tables
-- ================================================================

-- Add seller_id to orders (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'seller_id') THEN
    ALTER TABLE orders ADD COLUMN seller_id UUID;
  END IF;
END $$;

-- Add fulfillment fields to warehouses
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouses' AND column_name = 'has_inhouse_delivery') THEN
    ALTER TABLE warehouses ADD COLUMN has_inhouse_delivery BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouses' AND column_name = 'delivery_sla_minutes') THEN
    ALTER TABLE warehouses ADD COLUMN delivery_sla_minutes INTEGER DEFAULT 120;
  END IF;
END $$;

-- Add soft reserve fields to inventory
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'soft_reserved_qty') THEN
    ALTER TABLE inventory ADD COLUMN soft_reserved_qty INTEGER DEFAULT 0 NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'soft_reserve_expires_at') THEN
    ALTER TABLE inventory ADD COLUMN soft_reserve_expires_at TIMESTAMPTZ;
  END IF;
END $$;


-- 2. Create sub_orders table
-- ================================================================
CREATE TABLE IF NOT EXISTS sub_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  source_type           VARCHAR NOT NULL, -- 'division', 'zonal', 'seller'
  source_id             INTEGER NOT NULL REFERENCES warehouses(id),
  seller_id             UUID,

  fulfillment_status    VARCHAR NOT NULL DEFAULT 'pending',
  -- pending → confirmed → picked → in_transit → delivered
  -- also: dispatched_to_zonal_delivery, rider_pending, cancelled, return_to_source

  rider_id              UUID,
  pickup_sequence       JSONB DEFAULT '[]',
  estimated_delivery_at TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_orders_parent_order_id ON sub_orders(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_sub_orders_source_type ON sub_orders(source_type);
CREATE INDEX IF NOT EXISTS idx_sub_orders_source_id ON sub_orders(source_id);
CREATE INDEX IF NOT EXISTS idx_sub_orders_seller_id ON sub_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_sub_orders_fulfillment_status ON sub_orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_sub_orders_rider_id ON sub_orders(rider_id);


-- 3. Create sub_order_items table
-- ================================================================
CREATE TABLE IF NOT EXISTS sub_order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_order_id    UUID NOT NULL REFERENCES sub_orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  variant_id      UUID NOT NULL REFERENCES product_variants(id),
  quantity        INTEGER NOT NULL,
  unit_price      DECIMAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_order_items_sub_order_id ON sub_order_items(sub_order_id);
CREATE INDEX IF NOT EXISTS idx_sub_order_items_product_id ON sub_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sub_order_items_variant_id ON sub_order_items(variant_id);


-- 4. Create fulfillment_events table
-- ================================================================
CREATE TABLE IF NOT EXISTS fulfillment_events (
  id              SERIAL PRIMARY KEY,
  sub_order_id    UUID NOT NULL REFERENCES sub_orders(id) ON DELETE CASCADE,
  event_type      VARCHAR NOT NULL,
  payload         JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_events_sub_order_id ON fulfillment_events(sub_order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_event_type ON fulfillment_events(event_type);
CREATE INDEX IF NOT EXISTS idx_fulfillment_events_created_at ON fulfillment_events(created_at);


-- 5. Create rider_assignments table
-- ================================================================
CREATE TABLE IF NOT EXISTS rider_assignments (
  id              SERIAL PRIMARY KEY,
  rider_id        UUID NOT NULL REFERENCES riders(id),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pickup_sequence JSONB DEFAULT '[]',
  pickup_status   JSONB DEFAULT '{}',
  status          VARCHAR NOT NULL DEFAULT 'assigned',
  -- assigned → in_progress → completed | cancelled | reassigned
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rider_assignments_rider_id ON rider_assignments(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_assignments_order_id ON rider_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_rider_assignments_status ON rider_assignments(status);


-- 6. Mark existing zonal warehouses as having in-house delivery
-- ================================================================
UPDATE warehouses
SET has_inhouse_delivery = true,
    delivery_sla_minutes = 30
WHERE type = 'zonal';

-- Set division warehouses to 120 min SLA
UPDATE warehouses
SET delivery_sla_minutes = 120
WHERE type = 'division';


-- 7. Enable Row Level Security (RLS) for new tables (Supabase best practice)
-- ================================================================
ALTER TABLE sub_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_assignments ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_sub_orders" ON sub_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_sub_order_items" ON sub_order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_fulfillment_events" ON fulfillment_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_rider_assignments" ON rider_assignments FOR ALL USING (true) WITH CHECK (true);
