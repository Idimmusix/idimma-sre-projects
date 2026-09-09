import { describe, expect, it } from "vitest";
import { validateTrace, TraceValidationError } from "./schema";

describe("validateTrace", () => {
  it("accepts a well-formed trace", () => {
    const trace = validateTrace({
      cacheTtlSeconds: 300,
      turns: [
        { type: "context_load", timestamp: 0, tokens: 1000, cacheStatus: "hit" },
        { type: "wait", timestamp: 1, waitSeconds: 10 },
        { type: "tool_call", timestamp: 11, toolName: "search", outputBytes: 500, usefulBytes: 400 },
      ],
    });
    expect(trace.cacheTtlSeconds).toBe(300);
    expect(trace.turns).toHaveLength(3);
  });

  it("rejects a non-object input", () => {
    expect(() => validateTrace("not an object")).toThrow(TraceValidationError);
  });

  it("rejects a missing cacheTtlSeconds", () => {
    expect(() => validateTrace({ turns: [] })).toThrow(/cacheTtlSeconds/);
  });

  it("rejects a turn with an unknown type", () => {
    expect(() =>
      validateTrace({ cacheTtlSeconds: 300, turns: [{ type: "unknown", timestamp: 0 }] })
    ).toThrow(/type/);
  });

  it("rejects a context_load turn missing cacheStatus", () => {
    expect(() =>
      validateTrace({
        cacheTtlSeconds: 300,
        turns: [{ type: "context_load", timestamp: 0, tokens: 100 }],
      })
    ).toThrow(/cacheStatus/);
  });
});
