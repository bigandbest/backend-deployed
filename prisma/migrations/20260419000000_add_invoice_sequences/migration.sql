CREATE TABLE IF NOT EXISTS "invoice_sequences" (
  "fiscal_year"   VARCHAR(5)     NOT NULL,
  "last_sequence" INTEGER        NOT NULL DEFAULT 0,
  "updated_at"    TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("fiscal_year")
);
