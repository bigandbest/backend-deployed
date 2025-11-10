-- Add Warehouse Hierarchy Support
-- Created: 2024-11-04
-- Description: Adds parent-child relationship for warehouses (central -> zonal hierarchy)

-- Add parent_warehouse_id column to warehouses table
ALTER TABLE warehouses 
ADD COLUMN IF NOT EXISTS parent_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL;

-- Add index for parent warehouse lookups
CREATE INDEX IF NOT EXISTS idx_warehouses_parent_id ON warehouses(parent_warehouse_id);

-- Add hierarchy level for easier querying
ALTER TABLE warehouses 
ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0;

-- Create a constraint to prevent circular references
ALTER TABLE warehouses 
ADD CONSTRAINT check_no_self_reference 
CHECK (parent_warehouse_id != id);

-- Update existing warehouses to set hierarchy levels
UPDATE warehouses 
SET hierarchy_level = 0 
WHERE type = 'central' AND hierarchy_level IS NULL;

UPDATE warehouses 
SET hierarchy_level = 1 
WHERE type = 'zonal' AND hierarchy_level IS NULL;

-- Create view for warehouse hierarchy
CREATE OR REPLACE VIEW warehouse_hierarchy AS
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
    -- Get zones for this warehouse
    COALESCE(
        (SELECT array_agg(dz.name) 
         FROM warehouse_zones wz 
         JOIN delivery_zones dz ON wz.zone_id = dz.id 
         WHERE wz.warehouse_id = w.id AND wz.is_active = true), 
        '{}'::text[]
    ) as zones,
    w.created_at,
    w.updated_at
FROM warehouses w
LEFT JOIN warehouses pw ON w.parent_warehouse_id = pw.id
ORDER BY w.hierarchy_level, w.name;

-- Function to get warehouse hierarchy tree
CREATE OR REPLACE FUNCTION get_warehouse_tree()
RETURNS TABLE(
    warehouse_id INTEGER,
    warehouse_name VARCHAR(100),
    warehouse_type VARCHAR(20),
    parent_id INTEGER,
    level INTEGER,
    path TEXT,
    has_children BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE warehouse_tree AS (
        -- Root warehouses (central warehouses without parent)
        SELECT 
            w.id::INTEGER as warehouse_id,
            w.name::VARCHAR(100) as warehouse_name, 
            w.type::VARCHAR(20) as warehouse_type,
            w.parent_warehouse_id::INTEGER as parent_id,
            0 as level,
            w.name::TEXT as path,
            EXISTS(SELECT 1 FROM warehouses c WHERE c.parent_warehouse_id = w.id)::BOOLEAN as has_children
        FROM warehouses w 
        WHERE w.parent_warehouse_id IS NULL AND w.is_active = true
        
        UNION ALL
        
        -- Child warehouses
        SELECT 
            w.id::INTEGER,
            w.name::VARCHAR(100),
            w.type::VARCHAR(20), 
            w.parent_warehouse_id::INTEGER,
            wt.level + 1,
            (wt.path || ' > ' || w.name)::TEXT,
            EXISTS(SELECT 1 FROM warehouses c WHERE c.parent_warehouse_id = w.id)::BOOLEAN
        FROM warehouses w
        JOIN warehouse_tree wt ON w.parent_warehouse_id = wt.warehouse_id
        WHERE w.is_active = true
    )
    SELECT * FROM warehouse_tree ORDER BY level, warehouse_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get all child warehouses for a given parent
CREATE OR REPLACE FUNCTION get_child_warehouses(parent_id INTEGER)
RETURNS TABLE(
    id INTEGER,
    name VARCHAR(100),
    type VARCHAR(20),
    level INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE children AS (
        SELECT 
            w.id,
            w.name,
            w.type,
            1 as level
        FROM warehouses w 
        WHERE w.parent_warehouse_id = parent_id AND w.is_active = true
        
        UNION ALL
        
        SELECT 
            w.id,
            w.name,
            w.type,
            c.level + 1
        FROM warehouses w
        JOIN children c ON w.parent_warehouse_id = c.id
        WHERE w.is_active = true
    )
    SELECT * FROM children ORDER BY level, name;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN warehouses.parent_warehouse_id IS 'Reference to parent warehouse for hierarchical structure';
COMMENT ON COLUMN warehouses.hierarchy_level IS 'Level in warehouse hierarchy (0=central, 1=zonal, etc.)';
COMMENT ON VIEW warehouse_hierarchy IS 'Complete warehouse hierarchy view with parent relationships and zone mappings';
COMMENT ON FUNCTION get_warehouse_tree() IS 'Returns complete warehouse tree structure';
COMMENT ON FUNCTION get_child_warehouses(INTEGER) IS 'Returns all child warehouses for given parent warehouse ID';

-- Sample data to demonstrate hierarchy (uncomment if needed)
/*
-- Example: Create a central warehouse and link zonal warehouses to it
INSERT INTO warehouses (name, type, location, address, hierarchy_level) 
VALUES ('Main Central Hub', 'central', 'Mumbai', 'Central Distribution Center, Mumbai', 0)
ON CONFLICT (name) DO NOTHING;

-- Update existing zonal warehouses to be children of central warehouse
UPDATE warehouses 
SET parent_warehouse_id = (SELECT id FROM warehouses WHERE name = 'Main Central Hub' LIMIT 1),
    hierarchy_level = 1
WHERE type = 'zonal' AND parent_warehouse_id IS NULL;
*/