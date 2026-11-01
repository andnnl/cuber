import { FormulaCategory } from './formula-timer';

export function chooseFormulaItems<T extends { id: string; category: FormulaCategory }>(
  items: T[], category: FormulaCategory, selected: string[], slowOnly: boolean,
  isSlow: (id: string) => boolean, focusIds: string[] | null,
): T[] {
  const focus = focusIds === null ? null : new Set(focusIds);
  return items.filter(item => item.category === category && (focus !== null ? focus.has(item.id) :
    (!selected.length ? item.id.indexOf('oll:custom-') !== 0 : selected.indexOf(item.id) >= 0) &&
    (!slowOnly || isSlow(item.id))));
}
