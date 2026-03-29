export const predictionLifecycleStates = [
  "submitted",
  "working",
  "completed",
  "failed"
] as const;

export type PredictionLifecycleState = (typeof predictionLifecycleStates)[number];

const lifecycleTransitions: Record<PredictionLifecycleState, PredictionLifecycleState[]> = {
  submitted: ["working", "failed"],
  working: ["completed", "failed"],
  completed: [],
  failed: []
};

export function getNextPredictionLifecycleStates(
  state: PredictionLifecycleState
): PredictionLifecycleState[] {
  return [...lifecycleTransitions[state]];
}

export function canTransitionPredictionLifecycle(
  from: PredictionLifecycleState,
  to: PredictionLifecycleState
): boolean {
  return lifecycleTransitions[from].includes(to);
}

export function isTerminalPredictionLifecycleState(
  state: PredictionLifecycleState
): boolean {
  return lifecycleTransitions[state].length === 0;
}
