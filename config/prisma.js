// import "./loadEnv.js";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;

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
        url: process.env.DATABASE_URL,
      },
    },
    // Connection pool configuration for Supabase
    // Note: When using pgBouncer (connection pooling), these are managed by Supabase
    // but we can still configure client-side behavior
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
