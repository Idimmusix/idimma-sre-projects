import { describe, expect, it } from "vitest";
import { convertClaudeCodeExport } from "./convert-claude-code-export";

describe("convertClaudeCodeExport", () => {
  it("converts a minimal synthetic session into the expected turns", () => {
    const jsonl = [
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { usage: { cache_creation_input_tokens: 1000, cache_read_input_tokens: 0 }, content: [] },
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-01-01T00:01:00.000Z",
        message: {
          usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 500 },
          content: [{ type: "tool_use", id: "tool_1", name: "Bash" }],
        },
      }),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "tool_1", content: "hello world" }] },
      }),
    ].join("\n");

    const { trace, totalTurnCount } = convertClaudeCodeExport(jsonl);

    expect(totalTurnCount).toBe(4);
    expect(trace.cacheTtlSeconds).toBe(300);
    expect(trace.turns).toEqual([
      { type: "context_load", timestamp: 0, tokens: 1000, cacheStatus: "miss" },
      { type: "wait", timestamp: 0, waitSeconds: 60 },
      { type: "context_load", timestamp: 60, tokens: 500, cacheStatus: "hit" },
      { type: "tool_call", timestamp: 60, toolName: "Bash", outputBytes: 11, usefulBytes: 11 },
    ]);
  });

  it("truncates to the last 40 turns and reports the full count", () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      const ts = new Date(2026, 0, 1, 0, i, 0).toISOString();
      lines.push(
        JSON.stringify({
          type: "assistant",
          timestamp: ts,
          message: { usage: { cache_creation_input_tokens: 100, cache_read_input_tokens: 0 }, content: [] },
        })
      );
    }
    const jsonl = lines.join("\n");

    const { trace, totalTurnCount } = convertClaudeCodeExport(jsonl);

    // 50 assistant entries each producing 1 context_load turn, plus a wait
    // turn between every consecutive pair (49 waits) = 99 turns total.
    expect(totalTurnCount).toBe(99);
    expect(trace.turns).toHaveLength(40);
  });

  it("throws a plain Error when no usage data is found", () => {
    const jsonl = JSON.stringify({ type: "system", timestamp: "2026-01-01T00:00:00.000Z" });
    expect(() => convertClaudeCodeExport(jsonl)).toThrow(/No usage data found/);
  });

  it("skips malformed JSON lines without throwing", () => {
    const jsonl = [
      "not valid json {{{",
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { usage: { cache_creation_input_tokens: 1000, cache_read_input_tokens: 0 }, content: [] },
      }),
    ].join("\n");

    const { trace, totalTurnCount } = convertClaudeCodeExport(jsonl);

    expect(totalTurnCount).toBe(1);
    expect(trace.turns).toEqual([
      { type: "context_load", timestamp: 0, tokens: 1000, cacheStatus: "miss" },
    ]);
  });
});
