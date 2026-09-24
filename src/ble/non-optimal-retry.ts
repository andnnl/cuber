export type RetryTrainMode = "cross" | "xcross";

export interface RetryBestSlot {
  slot: string;
  steps: number;
  available: boolean;
}

export interface NonOptimalRetryInput {
  trainMode: RetryTrainMode;
  actualSteps: number;
  crossReady: boolean;
  crossBestSteps: number;
  crossBestValid: boolean;
  xcrossReady: boolean;
  completedSlots: string[];
  bestX: RetryBestSlot[];
}

/** 返回本次成功结果可比较的最优步数；无可靠求解结果时返回 null。 */
export function bestComparableSteps(input: NonOptimalRetryInput): number | null {
  if (input.trainMode === "cross") {
    return input.crossReady && input.crossBestValid ? input.crossBestSteps : null;
  }
  if (!input.xcrossReady) {
    return null;
  }
  const completed = new Set(input.completedSlots);
  const steps = input.bestX
    .filter((item) => completed.has(item.slot) && item.available)
    .map((item) => item.steps);
  return steps.length > 0 ? Math.min(...steps) : null;
}

export function shouldRetryNonOptimal(input: NonOptimalRetryInput): boolean {
  const best = bestComparableSteps(input);
  return best !== null && input.actualSteps !== best;
}
