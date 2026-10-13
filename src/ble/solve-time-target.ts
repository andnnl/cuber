const SOLVE_TIME_TARGETS = [0, 1, 2, 3, 5, 8, 10];

/** 0 表示关闭速度目标；旧值或非法值不触发自动重试。 */
export function parseSolveTimeTarget(value: string | null): number {
  const seconds = Number(value);
  return value !== null && SOLVE_TIME_TARGETS.indexOf(seconds) >= 0 ? seconds : 0;
}

/** 比较原始毫秒，不受结果展示的一位小数四舍五入影响。 */
export function isSolveTimeOverTarget(durationMs: number | null, targetSeconds: number): boolean {
  return durationMs !== null && Number.isFinite(durationMs) && durationMs >= 0 &&
    SOLVE_TIME_TARGETS.indexOf(targetSeconds) >= 0 && targetSeconds > 0 && durationMs > targetSeconds * 1000;
}
