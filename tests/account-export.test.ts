import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXPORT_COLLECTIONS,
  accountExportFilename,
  buildAccountExport,
  type AccountExportParts,
} from "@/lib/account-export";

function parts(overrides: Partial<AccountExportParts> = {}): AccountExportParts {
  return {
    user: { id: "u1", name: "Ada", email: "ada@example.com" },
    settings: null,
    memories: [],
    memoryPacks: [],
    projects: [],
    skills: [],
    chats: [],
    ...overrides,
  } as AccountExportParts;
}

describe("buildAccountExport", () => {
  it("carries every user-owned collection", () => {
    // The export is a backup, so the failure that matters is a table quietly
    // missing from it. `projects` and `skills` were both absent before #30.
    const payload = buildAccountExport(parts());
    for (const collection of ACCOUNT_EXPORT_COLLECTIONS) {
      expect(payload, `export is missing "${collection}"`).toHaveProperty(collection);
    }
  });

  it("keeps project instructions and skill bodies", () => {
    // `listProjects` returns a sidebar summary with no `instructions`, and
    // exporting that shape would lose the only part worth backing up.
    const payload = buildAccountExport(
      parts({
        projects: [{ id: "p1", name: "Work", instructions: "Be terse." }],
        skills: [{ id: "s1", name: "weekly-report", body: "# Weekly report" }],
      } as Partial<AccountExportParts>),
    );

    expect(payload.projects[0]).toMatchObject({ name: "Work", instructions: "Be terse." });
    expect(payload.skills[0]).toMatchObject({ name: "weekly-report", body: "# Weekly report" });
  });

  it("stamps the export time without disturbing the payload", () => {
    const now = new Date("2026-08-18T10:20:30.000Z");
    const payload = buildAccountExport(parts({ memories: [{ id: "m1" }] } as Partial<AccountExportParts>), now);

    expect(payload.exportedAt).toBe("2026-08-18T10:20:30.000Z");
    expect(payload.user.email).toBe("ada@example.com");
    expect(payload.memories).toHaveLength(1);
  });

  it("never carries a model API key", () => {
    // The key is localStorage-only and never reaches the server; this pins
    // that it does not arrive by some other route later.
    expect(JSON.stringify(buildAccountExport(parts()))).not.toMatch(/apiKey|api_key/i);
  });
});

describe("accountExportFilename", () => {
  it("is dated and .json", () => {
    expect(accountExportFilename(new Date("2026-08-18T23:59:59.000Z"))).toBe(
      "agentic-chat-export-2026-08-18.json",
    );
  });
});
