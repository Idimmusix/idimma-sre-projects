"use client";

import type { Trace } from "@/lib/agent-cost-inspector/schema";
import { BYTES_PER_TOKEN } from "@/lib/agent-cost-inspector/analyze";
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
