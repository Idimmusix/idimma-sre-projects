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
