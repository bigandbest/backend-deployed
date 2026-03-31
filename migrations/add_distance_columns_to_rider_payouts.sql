-- Migration: add distance tracking columns to rider_payouts
-- Run manually against your database (DO NOT use prisma migrate / db push).
--
-- distance_source          — which engine computed the distance: 'osrm' | 'haversine_fallback' | 'no_gps'
-- distance_calculated_at  — timestamp of when the distance was computed

ALTER TABLE rider_payouts
    ADD COLUMN IF NOT EXISTS distance_source         VARCHAR(30)  DEFAULT 'haversine_fallback',
    ADD COLUMN IF NOT EXISTS distance_calculated_at  TIMESTAMPTZ  NULL;

-- Optional index to query payouts by source (e.g. audit all haversine_fallback records)
CREATE INDEX IF NOT EXISTS idx_rider_payouts_distance_source ON rider_payouts (distance_source);
