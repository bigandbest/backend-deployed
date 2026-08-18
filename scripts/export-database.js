import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";

const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "database-export.json");
const BATCH_SIZE = Number(process.env.DB_EXPORT_BATCH_SIZE || 1000);
const SCHEMA_NAME = "public";

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

function parseArgs(argv) {
  const args = [...argv];
  let outputPath = DEFAULT_OUTPUT_PATH;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out" || arg === "-o") {
      outputPath = path.resolve(process.cwd(), args[index + 1] || "database-export.json");
      index += 1;
    }
  }

  return { outputPath };
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, "\"\"")}"`;
}

function serializeValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === "object") {
    if (value instanceof Prisma.Decimal || value?.constructor?.name === "Decimal") {
      return value.toString();
    }

    if (isDecimalLikeObject(value)) {
      return decimalLikeObjectToString(value);
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeValue(nestedValue)])
    );
  }

  return value;
}

async function getTables() {
  return prisma.$queryRawUnsafe(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = '${SCHEMA_NAME}'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `
  );
}

async function getPrimaryKeys() {
  return prisma.$queryRawUnsafe(
    `
      SELECT
        tc.table_name,
        kcu.column_name,
        kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = '${SCHEMA_NAME}'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name ASC, kcu.ordinal_position ASC
    `
  );
}

async function getForeignKeys() {
  return prisma.$queryRawUnsafe(
    `
      SELECT DISTINCT
        tc.table_name,
        ccu.table_name AS referenced_table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.table_schema = '${SCHEMA_NAME}'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name <> tc.table_name
      ORDER BY tc.table_name ASC, ccu.table_name ASC
    `
  );
}

function buildPrimaryKeyMap(primaryKeyRows) {
  const primaryKeyMap = new Map();

  for (const row of primaryKeyRows) {
    const existing = primaryKeyMap.get(row.table_name) || [];
    existing.push(row.column_name);
    primaryKeyMap.set(row.table_name, existing);
  }

  return primaryKeyMap;
}

function buildDependencyOrder(tableNames, foreignKeyRows) {
  const dependencyMap = new Map(tableNames.map((tableName) => [tableName, new Set()]));

  for (const row of foreignKeyRows) {
    if (!dependencyMap.has(row.table_name)) {
      dependencyMap.set(row.table_name, new Set());
    }

    dependencyMap.get(row.table_name).add(row.referenced_table_name);
  }

  const visiting = new Set();
  const visited = new Set();
  const ordered = [];

  function visit(tableName) {
    if (visited.has(tableName) || visiting.has(tableName)) {
      return;
    }

    visiting.add(tableName);

    for (const dependency of dependencyMap.get(tableName) || []) {
      visit(dependency);
    }

    visiting.delete(tableName);
    visited.add(tableName);
    ordered.push(tableName);
  }

  [...tableNames].sort().forEach(visit);
  return ordered;
}

function buildOrderByClause(primaryKeys) {
  if (!primaryKeys?.length) {
    return "";
  }

  const columns = primaryKeys.map((columnName) => `${quoteIdentifier(columnName)} ASC`).join(", ");
  return ` ORDER BY ${columns}`;
}

async function fetchTableData(tableName, primaryKeys) {
  const rows = [];
  let offset = 0;

  while (true) {
    const orderByClause = buildOrderByClause(primaryKeys);
    const sql = `SELECT * FROM ${quoteIdentifier(SCHEMA_NAME)}.${quoteIdentifier(tableName)}${orderByClause} LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
    const batch = await prisma.$queryRawUnsafe(sql);

    if (!batch.length) {
      break;
    }

    rows.push(...batch.map(serializeValue));
    offset += batch.length;

    if (batch.length < BATCH_SIZE) {
      break;
    }
  }

  return rows;
}

async function exportDatabase() {
  const { outputPath } = parseArgs(process.argv.slice(2));

  const tableRows = await getTables();
  const primaryKeyRows = await getPrimaryKeys();
  const foreignKeyRows = await getForeignKeys();

  const tableNames = tableRows.map((row) => row.table_name);
  const primaryKeyMap = buildPrimaryKeyMap(primaryKeyRows);
  const tableOrder = buildDependencyOrder(tableNames, foreignKeyRows);

  const tables = {};
  const counts = {};

  console.log(`📦 Exporting ${tableOrder.length} database tables...`);

  for (const tableName of tableOrder) {
    console.log(`→ ${tableName}`);
    const rows = await fetchTableData(tableName, primaryKeyMap.get(tableName) || []);
    tables[tableName] = rows;
    counts[tableName] = rows.length;
    console.log(`  ${rows.length} records`);
  }

  const payload = {
    meta: {
      exportedAt: new Date().toISOString(),
      source: "backend-deployed",
      schema: SCHEMA_NAME,
      batchSize: BATCH_SIZE,
      tableOrder,
      counts,
    },
    tables,
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`\n✅ Database export saved to ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportDatabase()
    .catch((error) => {
      console.error("\n❌ Database export failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export default exportDatabase;
