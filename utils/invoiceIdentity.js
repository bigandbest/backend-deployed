import { randomUUID } from "crypto";

function formatFinancialYear(date = new Date()) {
  // India FY is Apr-Mar. Example: Apr 2025 -> 25-26, Jan 2026 -> 25-26
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const yyStart = String(startYear).slice(-2);
  const yyEnd = String(endYear).slice(-2);
  return `${yyStart}-${yyEnd}`;
}

export async function generateInvoiceIdentity(tx, prefix = "QK") {
  const financialYear = formatFinancialYear();

  // Atomic increment per FY row. ON CONFLICT guarantees row-level locking behavior.
  const rows = await tx.$queryRaw`
    INSERT INTO invoice_sequences (fiscal_year, last_sequence, updated_at)
    VALUES (${financialYear}, 1, NOW())
    ON CONFLICT (fiscal_year)
    DO UPDATE SET
      last_sequence = invoice_sequences.last_sequence + 1,
      updated_at = NOW()
    RETURNING fiscal_year, last_sequence
  `;

  const sequence = Number(rows?.[0]?.last_sequence || 1);
  const paddedSequence = String(sequence).padStart(6, "0");

  return {
    invoice_number: `${prefix}-${financialYear}-${paddedSequence}`,
    irn: randomUUID(),
    orn: randomUUID(),
    invoice_generated_at: new Date(),
  };
}

export async function ensureOrderInvoiceIdentity(tx, orderId, prefix = "QK") {
  const generated = await generateInvoiceIdentity(tx, prefix);

  // COALESCE keeps existing values immutable if already populated.
  const rows = await tx.$queryRaw`
    UPDATE orders
    SET
      invoice_number = COALESCE(invoice_number, ${generated.invoice_number}),
      irn = COALESCE(irn, ${generated.irn}::uuid),
      orn = COALESCE(orn, ${generated.orn}::uuid),
      invoice_generated_at = COALESCE(invoice_generated_at, ${generated.invoice_generated_at}::timestamptz)
    WHERE id = ${String(orderId)}::uuid
    RETURNING id, invoice_number, irn, orn, invoice_generated_at
  `;

  return rows?.[0] || null;
}
