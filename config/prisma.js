// import "./loadEnv.js";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;

// In production (Vercel/serverless) keep connection_limit=1 to work with PgBouncer.
// In local development, boost the pool so concurrent homepage requests don't starve each other.
const buildDatabaseUrl = () => {
  const raw = process.env.DATABASE_URL || "";
  if (process.env.NODE_ENV === "production") return raw;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "10");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }
    return url.toString();
  } catch {
    return raw;
  }
};

// Optimized Prisma configuration with connection pooling and timeouts
const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "production"
      ? [{ emit: "stdout", level: "error" }]
      : [
          { emit: "event", level: "query" },
          { emit: "stdout", level: "error" },
          { emit: "stdout", level: "warn" },
        ],
    datasources: {
      db: {
        url: buildDatabaseUrl(),
      },
    },
  });

// Configure query timeout and connection lifecycle
prisma.$on('query', (e) => {
  if (e.duration > 1000) {
    console.warn(`⚠️ Slow query detected (${e.duration}ms):`, e.query);
  }
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Connect to database and verify connection
 */
export async function connectPrisma() {
  try {
    await prisma.$connect();
    // Test the connection with a simple query
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Prisma ORM: Connected to database successfully");
    return true;
  } catch (error) {
    console.error("❌ Prisma ORM: Failed to connect to database");
    console.error("Error:", error.message);
    throw error;
  }
}

/**
 * Gracefully disconnect from database
 */
export async function disconnectPrisma() {
  try {
    await prisma.$disconnect();
    console.log("👋 Prisma ORM: Disconnected from database");
  } catch (error) {
    console.error("Error disconnecting Prisma:", error);
  }
}

export default prisma;
