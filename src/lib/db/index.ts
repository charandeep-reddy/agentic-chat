import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One pool per process. Next.js dev reloads modules on every edit, so the pool
 * is cached on `globalThis` to avoid leaking connections into Postgres.
 *
 * `node-postgres` talks to both a local Postgres and Neon over the same wire
 * protocol, so `DATABASE_URL` is the only thing that changes between the two.
 * Neon requires TLS, which its connection string already carries as
 * `?sslmode=require`.
 */
const globalForDb = globalThis as unknown as {
  __agenticChatPool?: Pool;
  __agenticChatDb?: NodePgDatabase<typeof schema>;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres.",
    );
  }
  return new Pool({
    connectionString,
    // Neon and most hosted providers terminate TLS with a chain Node doesn't
    // ship; local Postgres has no TLS at all. `sslmode` in the URL decides.
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    max: 10,
  });
}

export function getPool(): Pool {
  globalForDb.__agenticChatPool ??= createPool();
  return globalForDb.__agenticChatPool;
}

function getDb(): NodePgDatabase<typeof schema> {
  globalForDb.__agenticChatDb ??= drizzle(getPool(), { schema });
  return globalForDb.__agenticChatDb;
}

/**
 * Connects on first use rather than on import, so modules can be imported for
 * their types (and unit-tested) without a live database.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get: (_target, prop, receiver) => Reflect.get(getDb(), prop, receiver),
});

export { schema };
