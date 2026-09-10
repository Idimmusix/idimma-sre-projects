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

  // Find the earliest timestamp to normalize all timestamps relative to it
  let minTimestamp: number | null = null;
  for (const entry of assistantEntries) {
    const timestamp = new Date(entry.timestamp as string).getTime() / 1000;
    if (minTimestamp === null || timestamp < minTimestamp) {
      minTimestamp = timestamp;
    }
  }

  const turns: Turn[] = [];
  let previousTimestamp: number | null = null;

  for (const entry of assistantEntries) {
    const timestamp = new Date(entry.timestamp as string).getTime() / 1000;
    const normalizedTimestamp = minTimestamp !== null ? timestamp - minTimestamp : 0;

    if (previousTimestamp !== null) {
      const waitSeconds = Math.round(normalizedTimestamp - previousTimestamp);
      if (waitSeconds > 0) {
        turns.push({ type: "wait", timestamp: Math.round(previousTimestamp), waitSeconds });
      }
    }
    previousTimestamp = normalizedTimestamp;

    const message = entry.message as JsonRecord | undefined;
    const usage = message?.usage as JsonRecord | undefined;
    const cacheCreation = typeof usage?.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : 0;
    const cacheRead = typeof usage?.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;

    if (cacheCreation > 0) {
      turns.push({ type: "context_load", timestamp: Math.round(normalizedTimestamp), tokens: cacheCreation, cacheStatus: "miss" });
    } else if (cacheRead > 0) {
      turns.push({ type: "context_load", timestamp: Math.round(normalizedTimestamp), tokens: cacheRead, cacheStatus: "hit" });
    }

    for (const block of getContentBlocks(entry)) {
      if (block.type !== "tool_use" || typeof block.id !== "string" || typeof block.name !== "string") continue;
      const result = toolResults.get(block.id);
      const outputBytes = result === undefined ? 0 : contentSize(result);
      turns.push({
        type: "tool_call",
        timestamp: Math.round(normalizedTimestamp),
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
