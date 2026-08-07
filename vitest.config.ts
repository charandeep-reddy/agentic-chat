import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Mermaid has to go through Vite's transform for `vi.mock` to reach the
    // DOMPurify import buried inside it — externalised deps are loaded by Node
    // directly and are unmockable. tests/flow-grammar.test.ts depends on this.
    server: { deps: { inline: ["mermaid"] } },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component. Under
      // Vitest there is no RSC boundary, so it is stubbed out; the guard still
      // does its job in the Next.js build.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
