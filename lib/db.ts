import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { setDefaultAutoSelectFamily } from "node:net";

/**
 * Disable Node's Happy Eyeballs address selection for outbound connections.
 *
 * Node 20+ races the IPv6 and IPv4 addresses of a hostname and keeps whichever
 * answers first. That is normally an improvement, and it is not safe to turn off
 * on general principle — but this host has no IPv6 route at all
 * (`connect` to an AAAA address fails with `ENETUNREACH`), and instead of
 * falling through to IPv4 the race stalls until the connect timeout and surfaces
 * as `ETIMEDOUT`.
 *
 * The symptom is indistinguishable from the database being unreachable: Prisma
 * reports `PrismaClientKnownRequestError` with `code: 'ETIMEDOUT'` on the first
 * query of any request. Every IPv4 address for the host is reachable, and the
 * same connection string works from `psql`, so it is purely address selection.
 *
 * Set before the pool is built, since it only changes the default for connections
 * that do not name a family themselves — and `pg` never does. Once a network
 * reachable over IPv6 is in use, this can go; the behaviour it restores is Node's
 * pre-20 default of connecting in DNS order.
 */
setDefaultAutoSelectFamily(false);

/**
 * Single Prisma client for the whole app.
 *
 * Prisma 7 connects through a driver adapter rather than a bundled engine, so the
 * Postgres connection string is passed to `@prisma/adapter-pg` here instead of
 * being read from the schema. In development the client is cached on
 * `globalThis` so hot reloads do not open a new connection pool per save.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Pool tuning, all of it defensive.
 *
 * The database is reached through Neon's pooler over a link that can be hundreds
 * of milliseconds to several seconds per round trip, and the compute behind it
 * scales to zero when idle. Two failures follow, and both arrive as an unhandled
 * error surfacing as a 500 on an ordinary request:
 *
 *  - the pooler reaps connections it considers idle, so a pooled connection can
 *    be gone by the time the next query picks it up. `keepAlive` holds the TCP
 *    socket open, and `idleTimeoutMillis` is set well above the pooler's own
 *    reaping window so the client, not the pooler, decides when a connection is
 *    retired.
 *  - reviving a suspended compute can take tens of seconds. `connectionTimeoutMillis`
 *    has to clear that cold start, or a perfectly healthy database reports
 *    `timeout exceeded when trying to connect` on the first request after an
 *    idle spell. It is generous on purpose: too short and it converts a slow
 *    success into a fast failure.
 *
 * `max` is deliberately small. This is a request-per-connection app, not a batch
 * job, and Neon counts concurrent connections against the plan.
 */
const POOL = {
  max: 10,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  // Longer than the pooler's idle window, so pooled connections stay warm across
  // the gaps between requests instead of being dropped and re-established.
  idleTimeoutMillis: 600_000,
  // Sized for a cold start of a suspended compute, not for a local socket.
  connectionTimeoutMillis: 60_000,
} as const;

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in — see docs/GETTING_STARTED.md.",
    );
  }
  const adapter = new PrismaPg({ connectionString, ...POOL });
  return new PrismaClient({ adapter });
}


export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
