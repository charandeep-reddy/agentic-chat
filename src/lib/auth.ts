import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/credentials";

function optionalProvider(id: string | undefined, secret: string | undefined) {
  return id && secret ? { clientId: id, clientSecret: secret } : undefined;
}

const google = optionalProvider(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);
const github = optionalProvider(
  process.env.GITHUB_CLIENT_ID,
  process.env.GITHUB_CLIENT_SECRET,
);

/**
 * Providers are registered only when their credentials exist, so a fresh clone
 * with a half-filled .env still boots and shows just the buttons that work.
 */
export const enabledProviders = [
  google ? ("google" as const) : null,
  github ? ("github" as const) : null,
].filter((p): p is "google" | "github" => p !== null);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders: {
    ...(google ? { google } : {}),
    ...(github ? { github } : {}),
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    autoSignIn: true,
    // There is no mail transport configured, so requiring verification would
    // lock every new account out permanently. Better Auth's account-linking
    // default already refuses to attach an OAuth identity to an unverified
    // local row, so an unverified password account cannot be used to claim
    // someone else's Google or GitHub address.
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the cookie at most once a day
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Must stay last: it lets server actions set the session cookie.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
