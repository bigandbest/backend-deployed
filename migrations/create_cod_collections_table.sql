-- Migration: create cod_collections table
-- COD (Cash on Delivery) collection records.
-- Run manually against your database (DO NOT use prisma migrate / db push).

CREATE TABLE IF NOT EXISTS cod_collections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id            UUID        NOT NULL,
    order_id            UUID        NOT NULL UNIQUE,
    amount_collected    DECIMAL(10, 2) NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING_DEPOSIT',
    -- Status values: PENDING_DEPOSIT | DEPOSIT_CLAIMED | APPROVED | REJECTED

    payment_proof       TEXT,
    claimed_at          TIMESTAMPTZ(6),
    approved_by         UUID,
    approved_at         TIMESTAMPTZ(6),
    rejected_reason     TEXT,
    notes               TEXT,

    created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT fk_cod_collections_rider
        FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    CONSTRAINT fk_cod_collections_order
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Indices for query performance
CREATE INDEX IF NOT EXISTS idx_cod_collections_rider_id ON cod_collections (rider_id);
CREATE INDEX IF NOT EXISTS idx_cod_collections_status ON cod_collections (status);
CREATE INDEX IF NOT EXISTS idx_cod_collections_order_id ON cod_collections (order_id);
