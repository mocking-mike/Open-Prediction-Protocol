import { describe, expect, it } from "vitest";

import {
  canTransitionPredictionLifecycle,
  getNextPredictionLifecycleStates,
  isTerminalPredictionLifecycleState,
  predictionLifecycleStates
} from "../src/lifecycle/index.js";

describe("prediction lifecycle", () => {
  it("exposes the supported v0.1 states", () => {
    expect(predictionLifecycleStates).toEqual([
      "submitted",
      "working",
      "completed",
      "failed"
    ]);
  });

  it("allows only the documented forward transitions", () => {
    expect(canTransitionPredictionLifecycle("submitted", "working")).toBe(true);
    expect(canTransitionPredictionLifecycle("submitted", "failed")).toBe(true);
    expect(canTransitionPredictionLifecycle("working", "completed")).toBe(true);
    expect(canTransitionPredictionLifecycle("working", "failed")).toBe(true);

    expect(canTransitionPredictionLifecycle("submitted", "completed")).toBe(false);
    expect(canTransitionPredictionLifecycle("completed", "working")).toBe(false);
    expect(canTransitionPredictionLifecycle("failed", "working")).toBe(false);
  });

  it("reports terminal states correctly", () => {
    expect(isTerminalPredictionLifecycleState("submitted")).toBe(false);
    expect(isTerminalPredictionLifecycleState("working")).toBe(false);
    expect(isTerminalPredictionLifecycleState("completed")).toBe(true);
    expect(isTerminalPredictionLifecycleState("failed")).toBe(true);
  });

  it("returns valid next states for each state", () => {
    expect(getNextPredictionLifecycleStates("submitted")).toEqual(["working", "failed"]);
    expect(getNextPredictionLifecycleStates("working")).toEqual(["completed", "failed"]);
    expect(getNextPredictionLifecycleStates("completed")).toEqual([]);
    expect(getNextPredictionLifecycleStates("failed")).toEqual([]);
  });
});
