import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env loader for tooling that runs outside Next.js (drizzle-kit, the
 * better-auth CLI). Next.js loads these files itself at runtime, so this is
 * never imported from application code.
 */
export function loadEnv(files = [".env.local", ".env"]): void {
  for (const file of files) {
    let raw: string;
    try {
      raw = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
