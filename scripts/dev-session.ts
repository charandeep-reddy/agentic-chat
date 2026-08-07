/**
 * Mints a signed session cookie for a local test user, so the whole
 * authenticated app can be exercised without configuring an OAuth provider.
 *
 *   bun run scripts/dev-session.ts
 *
 * Prints a `Cookie:` header value to use with curl or to paste into devtools.
 * Refuses to run against anything but a local database.
 */
import { makeSignature } from "better-auth/crypto";
import { getCookies } from "better-auth/cookies";
import { loadEnv } from "../lib/load-env";

loadEnv();

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Refusing to run: DATABASE_URL does not point at a local database.");
  process.exit(1);
}

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  console.error("BETTER_AUTH_SECRET is not set.");
  process.exit(1);
}

const { db } = await import("../lib/db");
const { session, user } = await import("../lib/db/schema");

const email = process.argv[2] ?? "dev@localhost";
const userId = `dev_${email.replace(/[^a-z0-9]/gi, "_")}`;
const token = crypto.randomUUID().replace(/-/g, "");

await db
  .insert(user)
  .values({
    id: userId,
    name: email.split("@")[0],
    email,
    emailVerified: true,
    image: null,
  })
  .onConflictDoNothing();

await db.insert(session).values({
  id: crypto.randomUUID(),
  userId,
  token,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
});

const cookieName = getCookies({ secret }).sessionToken.name;
const signature = await makeSignature(token, secret);

console.log(`user: ${email} (${userId})`);
console.log(`${cookieName}=${token}.${signature}`);

process.exit(0);
