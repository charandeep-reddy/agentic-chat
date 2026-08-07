import { describe, expect, it } from "vitest";
import { tools } from "@/lib/tools";

async function run<A, T>(toolName: keyof typeof tools, args: A): Promise<T> {
  const execute = tools[toolName].execute as unknown as (a: A, o?: unknown) => Promise<T>;
  return execute(args, {});
}

describe("tool registry", () => {
  it("wraps executions with timing metadata", async () => {
    const result = await run<{ type: "bar"; series: { name: string; data: number[] }[] }, { _meta: { durationMs: number }; kind: string }>("render_chart", {
      type: "bar",
      series: [{ name: "s", data: [1, 2] }],
    });
    expect(result._meta.durationMs).toBeGreaterThanOrEqual(1);
    expect(result.kind).toBe("chart");
  });

  it("keeps tool outputs intact under the timing wrapper", async () => {
    const table = await run<{ data: string; format: "csv" }, { kind: string; columns: { name: string; type: string }[]; rows: unknown[][] }>(
      "parse_data",
      { data: "a,b\n1,2", format: "csv" },
    );
    expect(table.kind).toBe("table");
    expect(table.columns).toEqual([
      { name: "a", type: "number" },
      { name: "b", type: "number" },
    ]);
    expect(table.rows).toEqual([[1, 2]]);
  });

  it("exposes every tool with an execute function", () => {
    for (const [name, def] of Object.entries(tools)) {
      expect(typeof def.execute, name).toBe("function");
    }
  });
});
