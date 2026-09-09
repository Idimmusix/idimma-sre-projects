# Agent Cost/Context Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Agent Cost/Context Inspector at `/agent-cost-inspector`: a client-side tool that runs an agent session trace against three cost-attribution detection rules and renders a token-by-turn chart plus a ranked violations list.

**Architecture:** Pure-function analysis library (`lib/agent-cost-inspector/`) covered by unit tests, consumed by a single client-rendered page (`app/agent-cost-inspector/page.tsx`). No backend, no persistence; everything runs in the browser.

**Tech Stack:** Next.js (App Router, already scaffolded), TypeScript, Tailwind, Vitest (new dependency, added in Task 2).

**Spec:** `~/personal/portfolio/docs/specs/2026-09-09-agent-cost-inspector-design.md`

## Global Constraints

- Local-first: every task's deliverable is verified with `npm run dev` (manual check) and/or `npm test` before moving to the next task. Cloud Run deployment is explicitly out of scope for this plan.
- No hardcoded values for anything that could differ between local and production. Follow the `idimma-tech` pattern: real values in a committed `.env.production`, a `.env.example` template for local overrides, `.env`/`.env.*.local` gitignored.
- No em dashes in any user-facing copy (site-wide rule already applied in `idimma-tech`; carries over here).
- Detection-rule thresholds are exact values from the spec: cache boundary violation range `(cacheTtlSeconds, cacheTtlSeconds * 1.5]`; tool output bloat threshold `usefulBytes / outputBytes < 0.2`; redundant reload threshold `waitSeconds < cacheTtlSeconds * 0.8`.

---

### Task 1: Fix hardcoded site metadata via environment variable

**Files:**
- Modify: `app/layout.tsx`
- Modify: `.gitignore`
- Create: `.env.production`
- Create: `.env.example`

**Interfaces:**
- Produces: `process.env.SITE_URL` consumed by `app/layout.tsx`'s `metadataBase`.

`app/layout.tsx` currently has no `metadataBase`, which Next.js needs to resolve absolute Open Graph/canonical URLs correctly, and that URL differs between local dev and production. This is the one hardcoded-vs-environment gap in the current scaffold; fix it now before adding more pages.

- [ ] **Step 1: Update `.gitignore` to allow committing `.env.production`**

Replace the existing env section:

```
# env files (can opt-in for committing if needed)
.env*
```

with:

```
# environment variables (local overrides only — .env.production holds
# real, non-secret site URLs and is intentionally committed)
.env
.env.*.local
```

- [ ] **Step 2: Create `.env.production`**

```
SITE_URL=https://sre-projects.idimma.tech
```

- [ ] **Step 3: Create `.env.example`**

```
# Copy to .env (or .env.development.local) to override for local dev.
# .env.production holds the real value and is used automatically by `next build`.
SITE_URL=http://localhost:3000
```

- [ ] **Step 4: Update `app/layout.tsx` to use `SITE_URL`**

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "SRE Projects · Idimma",
  description: "Live, runnable SRE/platform engineering demos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Verify locally**

Run: `npm run build`
Expected: build succeeds with no warnings about `metadataBase`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .env.production .env.example app/layout.tsx
git commit -m "Move site URL to environment variable, fix metadataBase"
```

---

### Task 2: Add Vitest for unit testing the analysis library

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: `npm test` script, runnable in all later tasks.

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In the `"scripts"` block, add:

```json
"test": "vitest run"
```

- [ ] **Step 4: Verify it runs with no tests yet**

Run: `npm test`
Expected: "No test files found" (not an error) — confirms the runner is wired up before any real tests exist.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "Add Vitest for unit testing lib/"
```

---

### Task 3: Trace schema and validation

**Files:**
- Create: `lib/agent-cost-inspector/schema.ts`
- Test: `lib/agent-cost-inspector/schema.test.ts`

**Interfaces:**
- Produces: `Trace`, `Turn`, `ContextLoadTurn`, `ToolCallTurn`, `WaitTurn` types; `TraceValidationError` class; `validateTrace(input: unknown): Trace` function.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/agent-cost-inspector/schema.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module './schema'"

- [ ] **Step 3: Write the implementation**

```ts
// lib/agent-cost-inspector/schema.ts
export type ContextLoadTurn = {
  type: "context_load";
  timestamp: number;
  tokens: number;
  cacheStatus: "hit" | "miss";
};

export type ToolCallTurn = {
  type: "tool_call";
  timestamp: number;
  toolName: string;
  outputBytes: number;
  usefulBytes: number;
};

export type WaitTurn = {
  type: "wait";
  timestamp: number;
  waitSeconds: number;
};

export type Turn = ContextLoadTurn | ToolCallTurn | WaitTurn;

export type Trace = {
  cacheTtlSeconds: number;
  turns: Turn[];
};

export class TraceValidationError extends Error {}

export function validateTrace(input: unknown): Trace {
  if (typeof input !== "object" || input === null) {
    throw new TraceValidationError("Trace must be an object");
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.cacheTtlSeconds !== "number" || obj.cacheTtlSeconds <= 0) {
    throw new TraceValidationError("cacheTtlSeconds must be a positive number");
  }
  if (!Array.isArray(obj.turns)) {
    throw new TraceValidationError("turns must be an array");
  }

  const turns = obj.turns.map((turn, index) => validateTurn(turn, index));
  return { cacheTtlSeconds: obj.cacheTtlSeconds, turns };
}

function validateTurn(turn: unknown, index: number): Turn {
  if (typeof turn !== "object" || turn === null) {
    throw new TraceValidationError(`turns[${index}] must be an object`);
  }
  const obj = turn as Record<string, unknown>;

  if (typeof obj.timestamp !== "number") {
    throw new TraceValidationError(`turns[${index}].timestamp must be a number`);
  }

  switch (obj.type) {
    case "context_load": {
      if (typeof obj.tokens !== "number") {
        throw new TraceValidationError(`turns[${index}].tokens must be a number`);
      }
      if (obj.cacheStatus !== "hit" && obj.cacheStatus !== "miss") {
        throw new TraceValidationError(`turns[${index}].cacheStatus must be "hit" or "miss"`);
      }
      return {
        type: "context_load",
        timestamp: obj.timestamp,
        tokens: obj.tokens,
        cacheStatus: obj.cacheStatus,
      };
    }
    case "tool_call": {
      if (typeof obj.toolName !== "string") {
        throw new TraceValidationError(`turns[${index}].toolName must be a string`);
      }
      if (typeof obj.outputBytes !== "number" || typeof obj.usefulBytes !== "number") {
        throw new TraceValidationError(`turns[${index}].outputBytes and usefulBytes must be numbers`);
      }
      return {
        type: "tool_call",
        timestamp: obj.timestamp,
        toolName: obj.toolName,
        outputBytes: obj.outputBytes,
        usefulBytes: obj.usefulBytes,
      };
    }
    case "wait": {
      if (typeof obj.waitSeconds !== "number") {
        throw new TraceValidationError(`turns[${index}].waitSeconds must be a number`);
      }
      return { type: "wait", timestamp: obj.timestamp, waitSeconds: obj.waitSeconds };
    }
    default:
      throw new TraceValidationError(
        `turns[${index}].type must be one of "context_load", "tool_call", "wait"`
      );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agent-cost-inspector/schema.ts lib/agent-cost-inspector/schema.test.ts
git commit -m "Add trace schema and validation"
```

---

### Task 4: Reference traces

**Files:**
- Create: `lib/agent-cost-inspector/sample-traces.ts`
- Test: `lib/agent-cost-inspector/sample-traces.test.ts`

**Interfaces:**
- Consumes: `Trace`, `validateTrace` from `./schema` (Task 3).
- Produces: `cacheBoundaryViolationTrace`, `toolOutputBloatTrace`, `redundantReloadTrace` (each type `Trace`); `referenceTraces` array of `{ id: string; label: string; trace: Trace }` for the UI's load-example buttons.

Note: the spec names two reference traces, but there are three detection rules (Task 5). A third reference trace is added here so every rule has a dedicated, loadable example, closing that gap rather than leaving rule 3 untestable from the UI.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/agent-cost-inspector/sample-traces.test.ts
import { describe, expect, it } from "vitest";
import { validateTrace } from "./schema";
import {
  cacheBoundaryViolationTrace,
  toolOutputBloatTrace,
  redundantReloadTrace,
  referenceTraces,
} from "./sample-traces";

describe("reference traces", () => {
  it("are all individually valid traces", () => {
    expect(() => validateTrace(cacheBoundaryViolationTrace)).not.toThrow();
    expect(() => validateTrace(toolOutputBloatTrace)).not.toThrow();
    expect(() => validateTrace(redundantReloadTrace)).not.toThrow();
  });

  it("exposes exactly 3 traces for the UI to load", () => {
    expect(referenceTraces).toHaveLength(3);
    expect(referenceTraces.map((r) => r.id)).toEqual([
      "cache-boundary-violation",
      "tool-output-bloat",
      "redundant-reload",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module './sample-traces'"

- [ ] **Step 3: Write the implementation**

```ts
// lib/agent-cost-inspector/sample-traces.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agent-cost-inspector/sample-traces.ts lib/agent-cost-inspector/sample-traces.test.ts
git commit -m "Add reference traces for all three detection rules"
```

---

### Task 5: Detection rules and aggregation

**Files:**
- Create: `lib/agent-cost-inspector/analyze.ts`
- Test: `lib/agent-cost-inspector/analyze.test.ts`

**Interfaces:**
- Consumes: `Trace`, `Turn` from `./schema` (Task 3); `cacheBoundaryViolationTrace`, `toolOutputBloatTrace`, `redundantReloadTrace` from `./sample-traces` (Task 4).
- Produces: `Violation` type; `AnalysisResult` type; `analyzeTrace(trace: Trace): AnalysisResult`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/agent-cost-inspector/analyze.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module './analyze'"

- [ ] **Step 3: Write the implementation**

```ts
// lib/agent-cost-inspector/analyze.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/agent-cost-inspector/analyze.ts lib/agent-cost-inspector/analyze.test.ts
git commit -m "Add detection rules and aggregation for agent cost analysis"
```

---

### Task 6: Token-by-turn chart component

**Files:**
- Create: `app/agent-cost-inspector/TokenTurnChart.tsx`

**Interfaces:**
- Consumes: `AnalysisResult`, `Trace` (to read per-turn token/byte data) from Tasks 3/5.
- Produces: `<TokenTurnChart trace={trace} result={result} />` component, consumed by Task 7's page.

Palette and mark spec below were produced by running the dataviz skill's validator (`validate_palette.js`) against this exact 3-category use case; both light and dark modes pass every check (worst adjacent CVD Delta E 9.2 light / 9.4 dark, both well above the 8.0 floor). The aqan (tool-output) color falls under 3:1 contrast on the light surface, which is why the legend below uses visible text labels rather than color alone (the skill's "relief rule").

- [ ] **Step 1: Write the component**

```tsx
// app/agent-cost-inspector/TokenTurnChart.tsx
"use client";

import type { Trace } from "@/lib/agent-cost-inspector/schema";
import type { AnalysisResult } from "@/lib/agent-cost-inspector/analyze";

type Segment = {
  category: "Cache hit" | "Cache miss" | "Tool output";
  tokens: number;
};

const CATEGORY_COLOR: Record<Segment["category"], string> = {
  "Cache hit": "var(--chart-cache-hit)",
  "Cache miss": "var(--chart-cache-miss)",
  "Tool output": "var(--chart-tool-output)",
};

const BYTES_PER_TOKEN = 4;

function turnToSegment(turn: Trace["turns"][number]): Segment | null {
  if (turn.type === "context_load") {
    return {
      category: turn.cacheStatus === "hit" ? "Cache hit" : "Cache miss",
      tokens: turn.tokens,
    };
  }
  if (turn.type === "tool_call") {
    return { category: "Tool output", tokens: Math.round(turn.outputBytes / BYTES_PER_TOKEN) };
  }
  return null;
}

export function TokenTurnChart({ trace, result }: { trace: Trace; result: AnalysisResult }) {
  const segments = trace.turns.map(turnToSegment).filter((s): s is Segment => s !== null);
  const maxTokens = Math.max(...segments.map((s) => s.tokens), 1);

  return (
    <div className="chart-root">
      <style>{`
        .chart-root {
          --chart-cache-hit: #2a78d6;
          --chart-cache-miss: #eb6834;
          --chart-tool-output: #1baf7a;
        }
        @media (prefers-color-scheme: dark) {
          .chart-root {
            --chart-cache-hit: #3987e5;
            --chart-cache-miss: #d95926;
            --chart-tool-output: #199e70;
          }
        }
      `}</style>

      <ul className="flex flex-col gap-1.5" aria-label="Tokens per turn">
        {segments.map((segment, index) => (
          <li key={index} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-xs text-neutral-500">Turn {index + 1}</span>
            <span
              className="block h-4 rounded"
              style={{
                width: `${Math.max((segment.tokens / maxTokens) * 100, 2)}%`,
                background: CATEGORY_COLOR[segment.category],
              }}
              title={`${segment.category}: ${segment.tokens} tokens`}
            />
            <span className="text-xs text-neutral-500">{segment.tokens} tok</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-4 text-sm">
        {(Object.keys(CATEGORY_COLOR) as Segment["category"][]).map((category) => (
          <span key={category} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: CATEGORY_COLOR[category] }}
            />
            {category}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-neutral-500">
        {result.totalWastedTokens} of {result.totalTokens} tokens attributable to a detected
        violation.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (this component has no tests of its own; it's covered by the manual browser check in Task 8).

- [ ] **Step 3: Commit**

```bash
git add app/agent-cost-inspector/TokenTurnChart.tsx
git commit -m "Add token-by-turn chart component"
```

---

### Task 7: Wire up the full page

**Files:**
- Modify: `app/agent-cost-inspector/page.tsx`

**Interfaces:**
- Consumes: `validateTrace`, `TraceValidationError` from `lib/agent-cost-inspector/schema`; `analyzeTrace` from `lib/agent-cost-inspector/analyze`; `referenceTraces` from `lib/agent-cost-inspector/sample-traces`; `TokenTurnChart` from Task 6.

- [ ] **Step 1: Replace the stub page with the full interface**

```tsx
// app/agent-cost-inspector/page.tsx
"use client";

import { useState } from "react";
import { validateTrace, TraceValidationError, type Trace } from "@/lib/agent-cost-inspector/schema";
import { analyzeTrace, type AnalysisResult } from "@/lib/agent-cost-inspector/analyze";
import { referenceTraces } from "@/lib/agent-cost-inspector/sample-traces";
import { TokenTurnChart } from "./TokenTurnChart";

export default function AgentCostInspector() {
  const [traceText, setTraceText] = useState("");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAnalysis(text: string) {
    try {
      const parsed = JSON.parse(text);
      const validTrace = validateTrace(parsed);
      setTrace(validTrace);
      setResult(analyzeTrace(validTrace));
      setError(null);
    } catch (err) {
      setTrace(null);
      setResult(null);
      setError(err instanceof TraceValidationError ? err.message : "Invalid JSON");
    }
  }

  function loadReference(id: string) {
    const reference = referenceTraces.find((r) => r.id === id);
    if (!reference) return;
    const text = JSON.stringify(reference.trace, null, 2);
    setTraceText(text);
    runAnalysis(text);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; All demos
      </a>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Agent Cost/Context Inspector</h1>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">
        A total token bill tells you a system is expensive, never why. This tool runs a session
        trace against three detection rules, cache-boundary violations, tool-output bloat, and
        redundant context reloads, each specified like a production alerting rule: a trigger
        condition, the underlying defect, and the cost impact.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {referenceTraces.map((reference) => (
          <button
            key={reference.id}
            onClick={() => loadReference(reference.id)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500"
          >
            Load: {reference.label}
          </button>
        ))}
      </div>

      <textarea
        className="mt-4 h-48 w-full rounded-md border border-neutral-300 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
        placeholder="Paste a trace matching the schema, or load a reference trace above."
        value={traceText}
        onChange={(event) => setTraceText(event.target.value)}
      />
      <button
        onClick={() => runAnalysis(traceText)}
        className="mt-2 rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Analyze
      </button>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {trace && result && (
        <div className="mt-8">
          <div className="grid grid-cols-3 gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div>
              <div className="text-2xl font-bold">{result.totalTokens}</div>
              <div className="text-xs text-neutral-500">Total tokens</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{result.totalWastedTokens}</div>
              <div className="text-xs text-neutral-500">Attributable waste</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{result.violations.length}</div>
              <div className="text-xs text-neutral-500">Violations</div>
            </div>
          </div>

          <div className="mt-6">
            <TokenTurnChart trace={trace} result={result} />
          </div>

          <ul className="mt-6 flex flex-col gap-3">
            {result.violations.map((violation, index) => (
              <li
                key={index}
                className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{violation.rule.replace(/_/g, " ")}</span>
                  <span className="text-xs text-neutral-500">
                    {violation.costImpactTokens} tokens
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {violation.defect}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests from Tasks 3-5 still PASS (this task adds no new unit tests; it's UI wiring, verified manually next).

- [ ] **Step 3: Manual verification in the browser**

Run: `npm run dev`
Then:
1. Open `http://localhost:3000/agent-cost-inspector`.
2. Click "Load: Cache Boundary Violation" — confirm the chart renders 2 bars, the summary shows 1 violation, and the violations list shows a `cache_boundary_violation` entry with 5000 tokens.
3. Click "Load: Tool Output Bloat" — confirm 1 violation, `tool_output_bloat`, 9900 tokens.
4. Click "Load: Redundant Context Reload" — confirm 1 violation, `redundant_context_reload`, 3000 tokens.
5. Paste `not valid json` into the textarea and click "Analyze" — confirm an error message renders instead of a crash.
6. Toggle your OS/browser dark mode — confirm the chart colors and text remain legible in both modes.

Expected: all six checks pass visually.

- [ ] **Step 4: Commit**

```bash
git add app/agent-cost-inspector/page.tsx
git commit -m "Wire up Agent Cost/Context Inspector page"
```

---

### Task 8: Final local verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests across `schema.test.ts`, `sample-traces.test.ts`, `analyze.test.ts` PASS.

- [ ] **Step 2: Run the production build locally**

Run: `npm run build && npm run start`
Then open `http://localhost:3000/agent-cost-inspector` and repeat the six checks from Task 7, Step 3 against the production build.
Expected: identical behavior to the dev server.

- [ ] **Step 3: Confirm no hardcoded environment-specific values remain**

Run: `grep -rn "sre-projects.idimma.tech\|localhost:3000" app/ lib/ --include="*.ts" --include="*.tsx"`
Expected: no matches outside of `.env.production`/`.env.example` (which are meant to hold these values).

Deployment to Cloud Run is a separate, later piece of work and is not part of this plan.
