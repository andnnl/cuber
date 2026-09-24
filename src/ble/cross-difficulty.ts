import { isCrossDone } from "./facelets";
import { applyFormulaFrom, toTrainFrame, z2Move } from "./move-diff";

export type CrossDifficulty = "random" | 2 | 3 | 4 | 5 | 6 | 7;

export const CROSS_DIFFICULTIES: CrossDifficulty[] = ["random", 2, 3, 4, 5, 6, 7];

export function parseCrossDifficulty(value: string | null): CrossDifficulty {
  if (value === "random") return "random";
  return value && /^[2-7]$/.test(value) ? (Number(value) as CrossDifficulty) : "random";
}

export function countFormulaMoves(formula: string): number {
  const value = formula.trim();
  return value ? value.split(/\s+/).length : 0;
}

const AXIS_FACES = [["U", "D"], ["R", "L"], ["F", "B"]];
const SUFFIXES = ["", "'", "2"];

export function randomCrossPerturbation(steps: number, random: () => number = Math.random): string[] {
  const result: string[] = [];
  let lastAxis = -1;
  while (result.length < steps) {
    const rawAxis = Math.floor(random() * AXIS_FACES.length);
    const axis = rawAxis === lastAxis ? (rawAxis + 1) % AXIS_FACES.length : rawAxis;
    const faces = AXIS_FACES[axis];
    const face = faces[Math.floor(random() * faces.length) % faces.length];
    const suffix = SUFFIXES[Math.floor(random() * SUFFIXES.length) % SUFFIXES.length];
    result.push(face + suffix);
    lastAxis = axis;
  }
  return result;
}

type GenerateOptions = {
  baseState: string;
  difficulty: Exclude<CrossDifficulty, "random">;
  z2On: boolean;
  randomScramble: () => string;
  solveCross: (state: string) => Promise<string[]>;
  perturbation?: (steps: number) => string[];
  isCurrent?: () => boolean;
};

function joinFormula(...parts: string[]): string {
  return parts.map(x => x.trim()).filter(Boolean).join(" ");
}

function checkedSolution(solutions: string[]): string {
  if (!solutions || solutions.length === 0) throw new Error("十字求解器没有返回解法");
  const solution = ((solutions && solutions[0]) || "").trim();
  if (solution.indexOf("error") === 0) throw new Error(solution);
  return solution;
}

export async function generateExactCrossScramble(options: GenerateOptions): Promise<string | null> {
  const current = options.isCurrent || (() => true);
  const makePerturbation = options.perturbation || randomCrossPerturbation;
  const targetFrame = (state: string) => (options.z2On ? toTrainFrame(state) : state);
  const physicalFormula = (formula: string) =>
    options.z2On && formula
      ? formula.split(/\s+/).map(z2Move).join(" ")
      : formula;

  for (let baseTry = 0; baseTry < 3; baseTry++) {
    if (!current()) return null;
    const seed = options.randomScramble();
    const seedState = applyFormulaFrom(options.baseState, seed);
    const anchorSolution = checkedSolution(await options.solveCross(targetFrame(seedState)));
    if (!current()) return null;
    const anchor = joinFormula(seed, physicalFormula(anchorSolution));
    const anchorState = applyFormulaFrom(options.baseState, anchor);
    if (!isCrossDone(targetFrame(anchorState))) throw new Error("十字基准校验失败");

    for (let suffixTry = 0; suffixTry < 100; suffixTry++) {
      if (!current()) return null;
      const suffix = makePerturbation(options.difficulty).join(" ");
      const formula = joinFormula(anchor, suffix);
      const state = applyFormulaFrom(options.baseState, formula);
      const solution = checkedSolution(await options.solveCross(targetFrame(state)));
      if (!current()) return null;
      if (countFormulaMoves(solution) === options.difficulty) return formula;
    }
  }
  throw new Error(`无法生成 ${options.difficulty} 步难度，请重试`);
}
