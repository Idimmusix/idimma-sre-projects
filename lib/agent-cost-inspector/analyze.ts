import type { Trace } from "./schema";

export type ViolationRule =
  | "cache_boundary_violation"
  | "tool_output_bloat"
  | "redundant_context_reload";

export type Violation = {
  rule: ViolationRule;
  turnIndex: number;
  defect: string;
  costImpactTokens: number;
};

export type AnalysisResult = {
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  toolOutputTokens: number;
  totalWastedTokens: number;
  violations: Violation[];
};

// Rough conversion for byte-denominated tool output into token terms.
const BYTES_PER_TOKEN = 4;

function detectCacheBoundaryViolations(trace: Trace): Violation[] {
  const violations: Violation[] = [];
  const { turns, cacheTtlSeconds } = trace;
  for (let i = 0; i < turns.length - 1; i++) {
    const turn = turns[i];
    const next = turns[i + 1];
    if (turn.type !== "wait" || next.type !== "context_load") continue;
    if (next.cacheStatus !== "miss") continue;
    const inViolationRange =
      turn.waitSeconds > cacheTtlSeconds && turn.waitSeconds <= cacheTtlSeconds * 1.5;
    if (!inViolationRange) continue;
    violations.push({
      rule: "cache_boundary_violation",
      turnIndex: i + 1,
      defect: `Waited ${turn.waitSeconds}s against a ${cacheTtlSeconds}s cache TTL, missing a cache hit by a margin rather than by design.`,
      costImpactTokens: next.tokens,
    });
  }
  return violations;
}

function detectToolOutputBloat(trace: Trace): Violation[] {
  const violations: Violation[] = [];
  trace.turns.forEach((turn, index) => {
    if (turn.type !== "tool_call") return;
    if (turn.outputBytes <= 0) return;
    const usefulRatio = turn.usefulBytes / turn.outputBytes;
    if (usefulRatio >= 0.2) return;
    const wastedBytes = turn.outputBytes - turn.usefulBytes;
    violations.push({
      rule: "tool_output_bloat",
      turnIndex: index,
      defect: `Tool "${turn.toolName}" returned ${turn.outputBytes} bytes but only ${turn.usefulBytes} were used (${Math.round(usefulRatio * 100)}% useful).`,
      costImpactTokens: Math.round(wastedBytes / BYTES_PER_TOKEN),
    });
  });
  return violations;
}

function detectRedundantContextReloads(trace: Trace): Violation[] {
  const violations: Violation[] = [];
  const { turns, cacheTtlSeconds } = trace;
  for (let i = 0; i < turns.length - 1; i++) {
    const turn = turns[i];
    const next = turns[i + 1];
    if (turn.type !== "wait" || next.type !== "context_load") continue;
    if (next.cacheStatus !== "miss") continue;
    if (turn.waitSeconds >= cacheTtlSeconds * 0.8) continue;
    violations.push({
      rule: "redundant_context_reload",
      turnIndex: i + 1,
      defect: `Reloaded from cold after only ${turn.waitSeconds}s against a ${cacheTtlSeconds}s TTL; this should have been a cache hit.`,
      costImpactTokens: next.tokens,
    });
  }
  return violations;
}

export function analyzeTrace(trace: Trace): AnalysisResult {
  const violations = [
    ...detectCacheBoundaryViolations(trace),
    ...detectToolOutputBloat(trace),
    ...detectRedundantContextReloads(trace),
  ];

  let totalTokens = 0;
  let cacheHitTokens = 0;
  let cacheMissTokens = 0;
  let toolOutputTokens = 0;

  for (const turn of trace.turns) {
    if (turn.type === "context_load") {
      totalTokens += turn.tokens;
      if (turn.cacheStatus === "hit") {
        cacheHitTokens += turn.tokens;
      } else {
        cacheMissTokens += turn.tokens;
      }
    } else if (turn.type === "tool_call") {
      const tokens = Math.round(turn.outputBytes / BYTES_PER_TOKEN);
      totalTokens += tokens;
      toolOutputTokens += tokens;
    }
  }

  const totalWastedTokens = violations.reduce((sum, v) => sum + v.costImpactTokens, 0);

  return {
    totalTokens,
    cacheHitTokens,
    cacheMissTokens,
    toolOutputTokens,
    totalWastedTokens,
    violations,
  };
}
