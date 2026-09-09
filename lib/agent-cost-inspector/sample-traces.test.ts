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
