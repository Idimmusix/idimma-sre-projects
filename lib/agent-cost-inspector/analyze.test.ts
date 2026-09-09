import { describe, expect, it } from "vitest";
import { analyzeTrace } from "./analyze";
import {
  cacheBoundaryViolationTrace,
  toolOutputBloatTrace,
  redundantReloadTrace,
} from "./sample-traces";

describe("analyzeTrace", () => {
  it("detects exactly one cache_boundary_violation on its reference trace", () => {
    const result = analyzeTrace(cacheBoundaryViolationTrace);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("cache_boundary_violation");
    expect(result.violations[0].costImpactTokens).toBe(5000);
  });

  it("detects exactly one tool_output_bloat on its reference trace", () => {
    const result = analyzeTrace(toolOutputBloatTrace);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("tool_output_bloat");
    expect(result.violations[0].costImpactTokens).toBe(9900); // (40000 - 400) / 4
  });

  it("detects exactly one redundant_context_reload on its reference trace", () => {
    const result = analyzeTrace(redundantReloadTrace);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe("redundant_context_reload");
    expect(result.violations[0].costImpactTokens).toBe(3000);
  });

  it("does not flag a wait comfortably inside the TTL with a cache hit", () => {
    const result = analyzeTrace({
      cacheTtlSeconds: 300,
      turns: [
        { type: "context_load", timestamp: 0, tokens: 1000, cacheStatus: "hit" },
        { type: "wait", timestamp: 1, waitSeconds: 50 },
        { type: "context_load", timestamp: 51, tokens: 1000, cacheStatus: "hit" },
      ],
    });
    expect(result.violations).toHaveLength(0);
  });

  it("does not flag a deliberate long wait past the violation range", () => {
    const result = analyzeTrace({
      cacheTtlSeconds: 300,
      turns: [
        { type: "wait", timestamp: 0, waitSeconds: 1000 },
        { type: "context_load", timestamp: 1000, tokens: 1000, cacheStatus: "miss" },
      ],
    });
    expect(result.violations).toHaveLength(0);
  });

  it("aggregates total, cache-hit, cache-miss, and tool-output tokens", () => {
    const result = analyzeTrace(cacheBoundaryViolationTrace);
    expect(result.cacheHitTokens).toBe(5000);
    expect(result.cacheMissTokens).toBe(5000);
    expect(result.toolOutputTokens).toBe(0);
    expect(result.totalTokens).toBe(10000);
    expect(result.totalWastedTokens).toBe(5000);
  });
});
