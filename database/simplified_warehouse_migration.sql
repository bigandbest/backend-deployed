-- Simplified Warehouse Hierarchy Migration (Zonal + Division only)
-- Created: 2025-11-09
-- Description: Removes central warehouse flow, keeps only zonal and division warehouses

-- First, update any existing central warehouses to zonal before changing constraints
UPDATE warehouses SET type = 'zonal' WHERE type = 'central';

-- Update warehouse types to remove 'central' and keep only 'zonal' and 'division'
ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_type_check;
ALTER TABLE warehouses ADD CONSTRAINT warehouses_type_check CHECK (type IN ('zonal', 'division'));

-- Update hierarchy levels: zonal=0, division=1
UPDATE warehouses SET hierarchy_level = 0 WHERE type = 'zonal';
UPDATE warehouses SET hierarchy_level = 1 WHERE type = 'division';

-- Remove parent_warehouse_id for zonal warehouses (they don't have parents anymore)
UPDATE warehouses SET parent_warehouse_id = NULL WHERE type = 'zonal';

-- For division warehouses that have invalid parents (not zonal), set parent to NULL temporarily
UPDATE warehouses SET parent_warehouse_id = NULL
WHERE type = 'division'
  AND parent_warehouse_id IS NOT NULL
  AND parent_warehouse_id NOT IN (
      SELECT id FROM warehouses WHERE type = 'zonal'
  );

-- Assign orphaned division warehouses to the first available zonal warehouse
UPDATE warehouses
SET parent_warehouse_id = (
    SELECT id FROM warehouses
    WHERE type = 'zonal' AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1
)
WHERE type = 'division'
  AND parent_warehouse_id IS NULL
  AND EXISTS (SELECT 1 FROM warehouses WHERE type = 'zonal' AND is_active = true);

-- Add constraint to ensure proper parent relationships:
-- Zonal warehouses cannot have parents, Division warehouses must have parents
ALTER TABLE warehouses ADD CONSTRAINT check_parent_warehouse_hierarchy
    CHECK (
        (type = 'zonal' AND parent_warehouse_id IS NULL) OR
        (type = 'division' AND parent_warehouse_id IS NOT NULL)
    );

-- Update the warehouse hierarchy view
CREATE OR REPLACE VIEW warehouse_hierarchy_detailed AS
SELECT
    w.id,
    w.name,
    w.type,
    w.location,
    w.address,
    w.is_active,
    w.parent_warehouse_id,
    pw.name as parent_warehouse_name,
    pw.type as parent_warehouse_type,
    w.hierarchy_level,
    -- Count child warehouses
    (SELECT COUNT(*) FROM warehouses cw WHERE cw.parent_warehouse_id = w.id) as child_count,
    -- Get zones for zonal warehouses
    COALESCE(
        (SELECT array_agg(dz.name)
         FROM warehouse_zones wz
         JOIN delivery_zones dz ON wz.zone_id = dz.id
         WHERE wz.warehouse_id = w.id AND wz.is_active = true),
        '{}'::text[]
    ) as zones,
    -- Get pincodes for division warehouses
    COALESCE(
        (SELECT array_agg(pincode)
         FROM warehouse_pincodes wp
         WHERE wp.warehouse_id = w.id AND wp.is_active = true),
        '{}'::text[]
    ) as pincodes,
    w.created_at,
    w.updated_at
FROM warehouses w
LEFT JOIN warehouses pw ON w.parent_warehouse_id = pw.id
ORDER BY w.hierarchy_level, w.name;

-- Update the find_warehouse_for_order function for simplified hierarchy
CREATE OR REPLACE FUNCTION find_warehouse_for_order(
    customer_pincode TEXT,
    product_type TEXT,
    preferred_warehouse_id INTEGER DEFAULT NULL
)
RETURNS TABLE(
    warehouse_id INTEGER,
    warehouse_name TEXT,
    warehouse_type TEXT,
    priority INTEGER,
    fallback_level INTEGER
) AS $$
DECLARE
    division_wh warehouse_pincodes%ROWTYPE;
    zonal_wh warehouses%ROWTYPE;
BEGIN
    -- For perishable items: only check division warehouse, no fallback
    IF product_type = 'perishable' THEN
        SELECT wp.* INTO division_wh
        FROM warehouse_pincodes wp
        JOIN warehouses w ON wp.warehouse_id = w.id
        WHERE wp.pincode = customer_pincode
          AND wp.is_active = true
          AND w.is_active = true
          AND w.type = 'division';

        IF FOUND THEN
            RETURN QUERY
            SELECT w.id, w.name, w.type::TEXT, 1, 0
            FROM warehouses w
            WHERE w.id = division_wh.warehouse_id;
        END IF;

        RETURN;
    END IF;

    -- For zonal items: check division warehouse first, then fallback to zonal
    IF product_type = 'zonal' THEN
        -- Try division warehouse first
        SELECT wp.* INTO division_wh
        FROM warehouse_pincodes wp
        JOIN warehouses w ON wp.warehouse_id = w.id
        WHERE wp.pincode = customer_pincode
          AND wp.is_active = true
          AND w.is_active = true
          AND w.type = 'division';

        IF FOUND THEN
            RETURN QUERY
            SELECT w.id, w.name, w.type::TEXT, 1, 0
            FROM warehouses w
            WHERE w.id = division_wh.warehouse_id;
        END IF;

        -- Fallback to zonal warehouse serving this pincode's zone
        SELECT w.* INTO zonal_wh
        FROM warehouses w
        JOIN warehouse_zones wz ON w.id = wz.warehouse_id
        JOIN delivery_zones dz ON wz.zone_id = dz.id
        JOIN zone_pincodes zp ON dz.id = zp.zone_id
        WHERE zp.pincode = customer_pincode
          AND w.type = 'zonal'
          AND w.is_active = true
          AND wz.is_active = true
          AND dz.is_active = true
          AND zp.is_active = true;

        IF FOUND THEN
            RETURN QUERY
            SELECT zonal_wh.id, zonal_wh.name, zonal_wh.type::TEXT, 2, 1;
        END IF;

        RETURN;
    END IF;

    -- For nationwide items: check division first, then zonal
    IF product_type = 'nationwide' THEN
        -- Try division warehouse first
        SELECT wp.* INTO division_wh
        FROM warehouse_pincodes wp
        JOIN warehouses w ON wp.warehouse_id = w.id
        WHERE wp.pincode = customer_pincode
          AND wp.is_active = true
          AND w.is_active = true
          AND w.type = 'division';

        IF FOUND THEN
            RETURN QUERY
            SELECT w.id, w.name, w.type::TEXT, 1, 0
            FROM warehouses w
            WHERE w.id = division_wh.warehouse_id;
        END IF;

        -- Fallback to zonal warehouse
        SELECT w.* INTO zonal_wh
        FROM warehouses w
        JOIN warehouse_zones wz ON w.id = wz.warehouse_id
        JOIN delivery_zones dz ON wz.zone_id = dz.id
        JOIN zone_pincodes zp ON dz.id = zp.zone_id
        WHERE zp.pincode = customer_pincode
          AND w.type = 'zonal'
          AND w.is_active = true
          AND wz.is_active = true
          AND dz.is_active = true
          AND zp.is_active = true;

        IF FOUND THEN
            RETURN QUERY
            SELECT zonal_wh.id, zonal_wh.name, zonal_wh.type::TEXT, 2, 1;
        END IF;

        RETURN;
    END IF;

    -- Default case (should not happen with proper validation)
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Update any existing central warehouses to zonal (if they exist)
-- UPDATE warehouses SET type = 'zonal' WHERE type = 'central'; -- Moved to top

-- Remove any central warehouse references in the codebase comments
-- This migration completes the transition to zonal + division only architecture