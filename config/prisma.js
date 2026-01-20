import "./loadEnv.js";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "info" },
      { emit: "stdout", level: "warn" },
    ],
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
