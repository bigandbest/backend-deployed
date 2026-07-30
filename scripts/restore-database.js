import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";

const DEFAULT_INPUT_PATH = path.resolve(process.cwd(), "database-export.json");
const DEFAULT_BATCH_SIZE = Number(process.env.DB_RESTORE_BATCH_SIZE || 100);
const SCHEMA_NAME = "public";

function parseArgs(argv) {
  const args = [...argv];
  let inputPath = DEFAULT_INPUT_PATH;
  let batchSize = DEFAULT_BATCH_SIZE;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--in" || arg === "-i") {
      inputPath = path.resolve(process.cwd(), args[index + 1] || "database-export.json");
      index += 1;
      continue;
    }

    if (arg === "--batch-size") {
      batchSize = Number(args[index + 1] || DEFAULT_BATCH_SIZE);
      index += 1;
    }
  }

  return {
    inputPath,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
  };
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, "\"\"")}"`;
}

function escapeString(value) {
  return String(value).replace(/'/g, "''");
}

function isDecimalLikeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "s") &&
    Object.prototype.hasOwnProperty.call(value, "e") &&
    Object.prototype.hasOwnProperty.call(value, "d")
  );
}

function decimalLikeObjectToString(value) {
  const sign = value.s === -1 ? "-" : "";
  const chunks = Array.isArray(value.d) ? value.d : [];

  if (!chunks.length || chunks.every((chunk) => Number(chunk) === 0)) {
    return "0";
  }

  const digits = chunks
    .map((chunk, index) => (index === 0 ? String(chunk) : String(chunk).padStart(7, "0")))
    .join("");

  const exponent = Number(value.e);
  const decimalIndex = exponent + 1;

  if (decimalIndex <= 0) {
    const fractional = `${"0".repeat(Math.abs(decimalIndex))}${digits}`.replace(/0+$/, "");
    return `${sign}0.${fractional || "0"}`;
  }

  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }

  const integerPart = digits.slice(0, decimalIndex);
  const fractionalPart = digits.slice(decimalIndex).replace(/0+$/, "");
  return fractionalPart ? `${sign}${integerPart}.${fractionalPart}` : `${sign}${integerPart}`;
}

function getArrayCast(columnMeta) {
  const udtName = columnMeta?.udtName || "";

  if (udtName === "_text" || udtName === "_varchar") return "::text[]";
  if (udtName === "_uuid") return "::uuid[]";
  if (udtName === "_int4") return "::integer[]";
  if (udtName === "_int8") return "::bigint[]";
  if (udtName === "_float4") return "::real[]";
  if (udtName === "_float8") return "::double precision[]";
  if (udtName === "_numeric") return "::numeric[]";
  if (udtName === "_bool") return "::boolean[]";
  if (udtName === "_jsonb") return "::jsonb[]";

  return "";
}

function isJsonColumn(columnMeta) {
  return columnMeta?.dataType === "json" || columnMeta?.dataType === "jsonb";
}

function toSqlLiteral(value, columnMeta) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (Array.isArray(value)) {
    if (isJsonColumn(columnMeta)) {
      return `'${escapeString(JSON.stringify(value))}'::${columnMeta.dataType}`;
    }

    const serialized = `{${value.map((item) => {
      if (item === null || item === undefined) {
        return "NULL";
      }

      return `"${String(item).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }).join(",")}}`;

    return `'${escapeString(serialized)}'${getArrayCast(columnMeta)}`;
  }

  if (typeof value === "object") {
    if (isDecimalLikeObject(value)) {
      return `'${escapeString(decimalLikeObjectToString(value))}'`;
    }

    if (isJsonColumn(columnMeta)) {
      return `'${escapeString(JSON.stringify(value))}'::${columnMeta.dataType}`;
    }

    return `'${escapeString(JSON.stringify(value))}'`;
  }

  return `'${escapeString(value)}'`;
}

async function getColumnsByTable() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = '${SCHEMA_NAME}'
    ORDER BY table_name ASC, ordinal_position ASC
  `);

  const columnsByTable = new Map();

  for (const row of rows) {
    const columns = columnsByTable.get(row.table_name) || [];
    columns.push({
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
    });
    columnsByTable.set(row.table_name, columns);
  }

  return columnsByTable;
}

async function getPrimaryKeysByTable() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = '${SCHEMA_NAME}'
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name ASC, kcu.ordinal_position ASC
  `);

  const primaryKeysByTable = new Map();

  for (const row of rows) {
    const columns = primaryKeysByTable.get(row.table_name) || [];
    columns.push(row.column_name);
    primaryKeysByTable.set(row.table_name, columns);
  }

  return primaryKeysByTable;
}

async function getSequenceBackedColumns() {
  return prisma.$queryRawUnsafe(`
    SELECT
      table_name,
      column_name,
      pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) AS sequence_name
    FROM information_schema.columns
    WHERE table_schema = '${SCHEMA_NAME}'
      AND column_default LIKE 'nextval(%'
    ORDER BY table_name ASC, ordinal_position ASC
  `);
}

function buildInsertStatement(tableName, columns, rows) {
  const quotedColumns = columns.map((column) => quoteIdentifier(column.name)).join(", ");
  const valuesSql = rows
    .map((row) => `(${columns.map((column) => toSqlLiteral(row[column.name], column)).join(", ")})`)
    .join(",\n");

  return `
    INSERT INTO ${quoteIdentifier(SCHEMA_NAME)}.${quoteIdentifier(tableName)} (${quotedColumns})
    VALUES
    ${valuesSql}
    ON CONFLICT DO NOTHING
  `;
}

async function restoreTable(tableName, rows, tableColumns, batchSize) {
  if (!rows?.length) {
    console.log(`  0 records`);
    return 0;
  }

  const insertableColumns = tableColumns.filter((column) =>
    rows.some((row) => Object.prototype.hasOwnProperty.call(row, column.name))
  );

  if (!insertableColumns.length) {
    console.log(`  skipped (no matching columns)`);
    return 0;
  }

  let inserted = 0;
  const totalBatches = Math.ceil(rows.length / batchSize);

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const batchNumber = Math.floor(offset / batchSize) + 1;
    console.log(`  batch ${batchNumber}/${totalBatches} (${batch.length} rows)`);
    const sql = buildInsertStatement(tableName, insertableColumns, batch);
    await prisma.$executeRawUnsafe(sql);
    inserted += batch.length;
    console.log(`  progress ${inserted}/${rows.length}`);
  }

  console.log(`  ${inserted} records processed`);
  return inserted;
}

async function syncSequences(sequenceRows) {
  for (const row of sequenceRows) {
    if (!row.sequence_name) {
      continue;
    }

    const sql = `
      SELECT setval(
        '${escapeString(row.sequence_name)}',
        COALESCE((SELECT MAX(${quoteIdentifier(row.column_name)}) FROM ${quoteIdentifier(SCHEMA_NAME)}.${quoteIdentifier(row.table_name)}), 1),
        COALESCE((SELECT COUNT(*) > 0 FROM ${quoteIdentifier(SCHEMA_NAME)}.${quoteIdentifier(row.table_name)}), false)
      )
    `;

    await prisma.$executeRawUnsafe(sql);
  }
}

async function restoreDatabase() {
  const { inputPath, batchSize } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Export file not found: ${inputPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const tableOrder = payload?.meta?.tableOrder || Object.keys(payload?.tables || {});
  const tables = payload?.tables || {};

  const columnsByTable = await getColumnsByTable();
  const primaryKeysByTable = await getPrimaryKeysByTable();
  const sequenceRows = await getSequenceBackedColumns();

  console.log(`📥 Restoring ${tableOrder.length} tables into current database...`);

  for (const tableName of tableOrder) {
    if (!columnsByTable.has(tableName)) {
      console.log(`→ ${tableName}`);
      console.log(`  skipped (table missing in target database)`);
      continue;
    }

    const rows = tables[tableName] || [];
    console.log(`→ ${tableName}`);

    if (!primaryKeysByTable.has(tableName)) {
      console.log(`  note: no primary key detected, using plain insert order`);
    }

    await restoreTable(tableName, rows, columnsByTable.get(tableName) || [], batchSize);
  }

  await syncSequences(sequenceRows);
  console.log("\n✅ Database restore completed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  restoreDatabase()
    .catch((error) => {
      console.error("\n❌ Database restore failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export default restoreDatabase;
