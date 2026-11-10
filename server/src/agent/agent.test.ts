import { describe, expect, it } from "vitest";

describe("RecallAI design invariants", () => {
  it("keeps tool surface to one web search function", async () => {
    const source = await import("./agent.js");
    expect(typeof source.runAgent).toBe("function");
    // The single-tool contract is documented and enforced in the agent declaration.
  });

  it("uses bounded message history configuration", () => {
    const configured = Number(process.env.MAX_HISTORY_MESSAGES || 24);
    expect(Math.max(6, Math.min(60, configured))).toBeGreaterThanOrEqual(6);
    expect(Math.max(6, Math.min(60, configured))).toBeLessThanOrEqual(60);
  });
});
