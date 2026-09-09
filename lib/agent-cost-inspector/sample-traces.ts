import type { Trace } from "./schema";

// Isolates the Cache Boundary Violation rule: a wait just past the TTL
// (300 < 350 <= 450) immediately followed by a cache miss. No tool_call
// turns, and no wait under 0.8 * ttl, so no other rule can fire.
export const cacheBoundaryViolationTrace: Trace = {
  cacheTtlSeconds: 300,
  turns: [
    { type: "context_load", timestamp: 0, tokens: 5000, cacheStatus: "hit" },
    { type: "wait", timestamp: 5, waitSeconds: 350 },
    { type: "context_load", timestamp: 355, tokens: 5000, cacheStatus: "miss" },
  ],
};

// Isolates the Tool Output Bloat rule: a tool call returning 40000 bytes
// where only 400 were useful (1% useful, well under the 20% threshold).
// No wait turns at all, so the wait-dependent rules cannot fire.
export const toolOutputBloatTrace: Trace = {
  cacheTtlSeconds: 300,
  turns: [
    { type: "context_load", timestamp: 0, tokens: 2000, cacheStatus: "hit" },
    { type: "tool_call", timestamp: 2, toolName: "search_logs", outputBytes: 40000, usefulBytes: 400 },
  ],
};

// Isolates the Redundant Context Reload rule: a wait of 100s, well under
// 0.8 * 300 = 240s, immediately followed by a cache miss. No tool_call
// turns, and the wait is outside the cache-boundary-violation range, so
// no other rule can fire.
export const redundantReloadTrace: Trace = {
  cacheTtlSeconds: 300,
  turns: [
    { type: "context_load", timestamp: 0, tokens: 3000, cacheStatus: "hit" },
    { type: "wait", timestamp: 2, waitSeconds: 100 },
    { type: "context_load", timestamp: 102, tokens: 3000, cacheStatus: "miss" },
  ],
};

export const referenceTraces: { id: string; label: string; trace: Trace }[] = [
  {
    id: "cache-boundary-violation",
    label: "Cache Boundary Violation",
    trace: cacheBoundaryViolationTrace,
  },
  {
    id: "tool-output-bloat",
    label: "Tool Output Bloat",
    trace: toolOutputBloatTrace,
  },
  {
    id: "redundant-reload",
    label: "Redundant Context Reload",
    trace: redundantReloadTrace,
  },
];
