import { defineConfig } from "@prisma/config";

/**
 * Prisma 7 no longer accepts `url` inside schema.prisma, so the connection
 * string lives here.
 *
 * `MIGRATIONS_DATABASE_URL` wins when present: on Neon the pooled endpoint is
 * correct for runtime traffic but not for DDL, so migrations must use the
 * direct endpoint. Locally both fall back to the docker-compose database.
 */
const LOCAL_URL =
  "postgresql://siroq_client:siroq_client_dev_password@127.0.0.1:5434/siroq_client?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url:
      process.env.MIGRATIONS_DATABASE_URL ||
      process.env.DATABASE_URL ||
      LOCAL_URL,
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --env-file=.env prisma/seed.ts",
  },
});

