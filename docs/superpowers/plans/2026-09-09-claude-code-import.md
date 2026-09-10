# Claude Code Session Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor upload a real Claude Code `.jsonl` session export on `/agent-cost-inspector` and see it analyzed by the existing detection rules, instead of only being able to use the two built-in reference traces or hand-author JSON in a custom schema.

**Architecture:** A pure-function converter (`lib/agent-cost-inspector/convert-claude-code-export.ts`) maps the real Claude Code JSONL shape into the existing `Trace` type, entirely client-side. `page.tsx` gains a file input that runs the converter and feeds its output through the same `validateTrace` → `analyzeTrace` → render path the reference buttons already use.

**Tech Stack:** Same as the existing feature (Next.js App Router, TypeScript, Vitest). No new dependencies.

**Spec:** `~/personal/portfolio/docs/specs/2026-09-09-claude-code-import-design.md`

## Global Constraints

- Local-first: every task's deliverable is verified with `npm test` and/or `npm run build` before moving to the next task. No deployment step in this plan.
- No hardcoded values differing between local/production are to be introduced (this feature is pure client-side conversion with no environment-dependent config).
- No em dashes in any new user-facing copy.
- Fixed values from the spec, exact: `MAX_TURNS = 40`, `ESTIMATED_USEFUL_BYTES_CAP = 500`, `CACHE_TTL_SECONDS = 300` (matches the existing reference traces' TTL).
- This plan continues on the existing branch `worktree-agent-cost-inspector` in the existing worktree — no new worktree, no new branch. PR #1 is already open against `main` for prior work; these commits land on top of it.

---

### Task 1: Claude Code export converter

**Files:**
- Create: `lib/agent-cost-inspector/convert-claude-code-export.ts`
- Test: `lib/agent-cost-inspector/convert-claude-code-export.test.ts`

**Interfaces:**
- Consumes: `Trace`, `Turn` types from `./schema` (already exists).
- Produces: `ConvertResult` type (`{ trace: Trace; totalTurnCount: number }`); `convertClaudeCodeExport(jsonlText: string): ConvertResult`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/agent-cost-inspector/convert-claude-code-export.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with "Cannot find module './convert-claude-code-export'"

- [ ] **Step 3: Write the implementation**

```ts
// lib/agent-cost-inspector/convert-claude-code-export.ts
import type { Trace, Turn } from "./schema";

export type ConvertResult = { trace: Trace; totalTurnCount: number };

const CACHE_TTL_SECONDS = 300;
const MAX_TURNS = 40;
const ESTIMATED_USEFUL_BYTES_CAP = 500;

type JsonRecord = Record<string, unknown>;

function parseLines(jsonlText: string): JsonRecord[] {
  const entries: JsonRecord[] = [];
  for (const line of jsonlText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === "object") {
        entries.push(parsed as JsonRecord);
      }
    } catch {
      // Skip malformed lines silently.
    }
  }
  return entries;
}

function contentSize(content: unknown): number {
  if (typeof content === "string") return content.length;
  return JSON.stringify(content ?? "").length;
}

function getContentBlocks(entry: JsonRecord): JsonRecord[] {
  const message = entry.message as JsonRecord | undefined;
  const content = message?.content;
  return Array.isArray(content) ? (content as JsonRecord[]) : [];
}

export function convertClaudeCodeExport(jsonlText: string): ConvertResult {
  const entries = parseLines(jsonlText);

  const toolResults = new Map<string, unknown>();
  for (const entry of entries) {
    if (entry.type !== "user") continue;
    for (const block of getContentBlocks(entry)) {
      if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        toolResults.set(block.tool_use_id, block.content);
      }
    }
  }

  const assistantEntries = entries.filter((entry) => entry.type === "assistant" && typeof entry.timestamp === "string");

  const turns: Turn[] = [];
  let previousTimestamp: number | null = null;

  for (const entry of assistantEntries) {
    const timestamp = new Date(entry.timestamp as string).getTime() / 1000;

    if (previousTimestamp !== null) {
      const waitSeconds = Math.round(timestamp - previousTimestamp);
      if (waitSeconds > 0) {
        turns.push({ type: "wait", timestamp: Math.round(previousTimestamp), waitSeconds });
      }
    }
    previousTimestamp = timestamp;

    const message = entry.message as JsonRecord | undefined;
    const usage = message?.usage as JsonRecord | undefined;
    const cacheCreation = typeof usage?.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : 0;
    const cacheRead = typeof usage?.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;

    if (cacheCreation > 0) {
      turns.push({ type: "context_load", timestamp: Math.round(timestamp), tokens: cacheCreation, cacheStatus: "miss" });
    } else if (cacheRead > 0) {
      turns.push({ type: "context_load", timestamp: Math.round(timestamp), tokens: cacheRead, cacheStatus: "hit" });
    }

    for (const block of getContentBlocks(entry)) {
      if (block.type !== "tool_use" || typeof block.id !== "string" || typeof block.name !== "string") continue;
      const result = toolResults.get(block.id);
      const outputBytes = result === undefined ? 0 : contentSize(result);
      turns.push({
        type: "tool_call",
        timestamp: Math.round(timestamp),
        toolName: block.name,
        outputBytes,
        usefulBytes: Math.min(outputBytes, ESTIMATED_USEFUL_BYTES_CAP),
      });
    }
  }

  const hasUsageData = turns.some((turn) => turn.type === "context_load");
  if (!hasUsageData) {
    throw new Error("No usage data found in this file. Is it a Claude Code session .jsonl export?");
  }

  const totalTurnCount = turns.length;
  const truncated = turns.slice(Math.max(0, turns.length - MAX_TURNS));

  return {
    trace: { cacheTtlSeconds: CACHE_TTL_SECONDS, turns: truncated },
    totalTurnCount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 4 new tests PASS, plus all 13 prior tests still passing (17 total)

- [ ] **Step 5: Commit**

```bash
git add lib/agent-cost-inspector/convert-claude-code-export.ts lib/agent-cost-inspector/convert-claude-code-export.test.ts
git commit -m "Add Claude Code session export converter"
```

---

### Task 2: Wire the file import into the page

**Files:**
- Modify: `app/agent-cost-inspector/page.tsx` (full replacement below)

**Interfaces:**
- Consumes: `convertClaudeCodeExport`, `ConvertResult` from `./convert-claude-code-export` (Task 1); everything already imported by the existing page (`validateTrace`, `TraceValidationError`, `Trace`, `analyzeTrace`, `AnalysisResult`, `referenceTraces`, `TokenTurnChart`).

- [ ] **Step 1: Replace the page with the import-aware version**

```tsx
// app/agent-cost-inspector/page.tsx
"use client";

import { useState, type ChangeEvent } from "react";
import { validateTrace, TraceValidationError, type Trace } from "@/lib/agent-cost-inspector/schema";
import { analyzeTrace, type AnalysisResult } from "@/lib/agent-cost-inspector/analyze";
import { referenceTraces } from "@/lib/agent-cost-inspector/sample-traces";
import { convertClaudeCodeExport } from "@/lib/agent-cost-inspector/convert-claude-code-export";
import { TokenTurnChart } from "./TokenTurnChart";

export default function AgentCostInspector() {
  const [traceText, setTraceText] = useState("");
  const [trace, setTrace] = useState<Trace | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImported, setIsImported] = useState(false);
  const [totalTurnCount, setTotalTurnCount] = useState<number | null>(null);

  function runAnalysis(text: string) {
    setIsImported(false);
    setTotalTurnCount(null);
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

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const jsonlText = String(reader.result ?? "");
      try {
        const { trace: convertedTrace, totalTurnCount: fullCount } = convertClaudeCodeExport(jsonlText);
        const text = JSON.stringify(convertedTrace, null, 2);
        const validTrace = validateTrace(convertedTrace);
        setTraceText(text);
        setTrace(validTrace);
        setResult(analyzeTrace(validTrace));
        setIsImported(true);
        setTotalTurnCount(fullCount);
        setError(null);
      } catch (err) {
        setTrace(null);
        setResult(null);
        setIsImported(false);
        setTotalTurnCount(null);
        setError(err instanceof Error ? err.message : "Could not parse this file");
      }
    };
    reader.readAsText(file);
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

      <div className="mt-6 rounded-md border border-neutral-300 p-4 dark:border-neutral-700">
        <label className="block text-sm font-medium">Import a Claude Code session (.jsonl)</label>
        <input type="file" accept=".jsonl" onChange={handleFileUpload} className="mt-2 text-sm" />
        <p className="mt-2 text-xs text-neutral-500">
          Find your own session at{" "}
          <code>~/.claude/projects/&lt;your-cwd-with-slashes-as-dashes&gt;/&lt;session-id&gt;.jsonl</code>.
        </p>
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
          {isImported && totalTurnCount !== null && totalTurnCount > 40 && (
            <p className="mb-4 text-xs text-neutral-500">
              Showing the last 40 of {totalTurnCount} turns.
            </p>
          )}

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
              <li key={index} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{violation.rule.replace(/_/g, " ")}</span>
                  <span className="text-xs text-neutral-500">{violation.costImpactTokens} tokens</span>
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {violation.defect}
                  {isImported && violation.rule === "tool_output_bloat"
                    ? " (usefulBytes is estimated, not measured, for imported sessions)"
                    : ""}
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

- [ ] **Step 2: Run the existing test suite (unchanged by this task)**

Run: `npm test`
Expected: all 17 tests still PASS (this task is UI wiring, no new unit tests; verified manually next)

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 4: Substitute manual verification (no browser tooling available in this environment)**

Since there is no headless browser tooling available (confirmed in the prior plan's execution), verify the wiring by direct inspection and a small script instead of clicking through a real browser:

1. Read the diff and confirm `handleFileUpload` calls `convertClaudeCodeExport`, then `validateTrace` on its output, then `analyzeTrace`, in that order, matching the reference-button path (`loadReference` → `runAnalysis` → `validateTrace` → `analyzeTrace`). Both paths must converge on the same `validateTrace`/`analyzeTrace` calls.
2. Task 1's tests already call `convertClaudeCodeExport` directly and assert on its exact output, and `npm run build`'s TypeScript check already confirms `page.tsx` calls `validateTrace`/`analyzeTrace` with correctly-typed arguments. Together these are the verification for this task's logic — no additional ad-hoc script is needed.
3. What remains genuinely unverified without a real browser: the actual file-picker interaction, the truncation note rendering, and the estimated-usefulBytes caveat text rendering. List these explicitly in the report for a human to check.

- [ ] **Step 5: Commit**

```bash
git add app/agent-cost-inspector/page.tsx
git commit -m "Add Claude Code session import to Agent Cost Inspector page"
```

---

### Task 3: Final local verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: 17/17 tests pass (13 from before + 4 new).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: succeeds, all routes generate.

- [ ] **Step 3: Confirm no em dashes in new copy**

Run: `grep -n "—" lib/agent-cost-inspector/convert-claude-code-export.ts app/agent-cost-inspector/page.tsx`
Expected: no matches.

- [ ] **Step 4: Confirm no new hardcoded environment-specific values**

Run: `grep -n "sre-projects.idimma.tech\|localhost:3000" lib/agent-cost-inspector/convert-claude-code-export.ts app/agent-cost-inspector/page.tsx`
Expected: no matches (this feature has no environment-dependent config).

This plan does not include a deployment step or a PR update; report completion and let the coordinating session decide whether to push these commits to the already-open PR #1.
