import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client for the whole app.
 *
 * Prisma 7 connects through a driver adapter rather than a bundled engine, so
 * the Postgres connection string is passed to `@prisma/adapter-pg` here instead
 * of being read from the schema. In development the client is cached on
 * `globalThis` so hot reloads do not open a new connection pool per save.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in — see docs/GETTING_STARTED.md.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
