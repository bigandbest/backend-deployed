-- Platform Fee Management Migration

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS has_fee boolean DEFAULT false;

ALTER TABLE subcategories
ADD COLUMN IF NOT EXISTS has_fee boolean DEFAULT false;

ALTER TABLE groups
ADD COLUMN IF NOT EXISTS has_fee boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS platform_fee_configurations (
  id serial PRIMARY KEY,
  entity_type varchar NOT NULL,
  entity_id uuid NOT NULL,
  fee_percentage numeric(5,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT platform_fee_configurations_unique_entity UNIQUE (entity_type, entity_id),
  CONSTRAINT platform_fee_configurations_entity_type_check
    CHECK (entity_type IN ('category', 'subcategory', 'group')),
  CONSTRAINT platform_fee_percentage_range_check
    CHECK (fee_percentage >= 0 AND fee_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_entity
ON platform_fee_configurations(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS platform_fee_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar NOT NULL,
  entity_type varchar NOT NULL,
  fee_percentage numeric(5,2) NOT NULL,
  is_active boolean DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT platform_fee_groups_entity_type_check
    CHECK (entity_type IN ('category', 'subcategory', 'group')),
  CONSTRAINT platform_fee_groups_fee_percentage_range_check
    CHECK (fee_percentage >= 0 AND fee_percentage <= 100)
);

CREATE TABLE IF NOT EXISTS platform_fee_group_entities (
  id serial PRIMARY KEY,
  fee_group_id uuid NOT NULL REFERENCES platform_fee_groups(id) ON DELETE CASCADE,
  entity_type varchar NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT platform_fee_group_entities_entity_type_check
    CHECK (entity_type IN ('category', 'subcategory', 'group')),
  CONSTRAINT platform_fee_group_entities_unique_in_group UNIQUE (fee_group_id, entity_id),
  CONSTRAINT platform_fee_group_entities_unique_entity UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_groups_entity_type
ON platform_fee_groups(entity_type);

CREATE INDEX IF NOT EXISTS idx_platform_fee_group_entities_entity
ON platform_fee_group_entities(entity_type, entity_id);
