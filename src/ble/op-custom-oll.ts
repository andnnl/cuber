import { OpItem } from './op-case';
import { parseOpFormula } from './op-formula';

export type CustomOll = { id: string; name: string; origin: string };
type StoredSettings = { customOlls?: unknown; customOll?: unknown; useCustom?: unknown; ollNames?: unknown };

export function customOllItem(item: CustomOll): OpItem {
  return { name: `自定义 · ${item.name}`, origin: item.origin };
}

/** Only valid, stable identifiers enter the selectable pool; legacy single-entry settings migrate once. */
export function restoreCustomOlls(saved: StoredSettings, builtin: OpItem[], validate?: (item: OpItem) => void):
  { customOlls: CustomOll[]; ollNames: string[] } {
  const existing = Array.isArray(saved.customOlls);
  const raw: unknown[] = existing ? saved.customOlls as unknown[] :
    typeof saved.customOll === 'string' && saved.customOll.trim() ?
      [{ id: 'custom-legacy', name: '旧自定义 OLL', origin: saved.customOll }] : [];
  const seen = new Set<string>();
  const customOlls: CustomOll[] = [];
  for (const entry of raw.slice(0, 100)) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as CustomOll;
    if (typeof item.id !== 'string' || !/^custom-[\w-]+$/.test(item.id) || seen.has(item.id) ||
        typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 40 ||
        typeof item.origin !== 'string') continue;
    try {
      parseOpFormula(item.origin);
      validate?.(customOllItem(item));
    } catch { continue; }
    seen.add(item.id);
    customOlls.push({ id: item.id, name: item.name.trim(), origin: item.origin.trim() });
  }
  const known = new Set([...builtin.map(item => item.name), ...customOlls.map(item => item.id)]);
  const ollNames = existing || !saved.useCustom ?
    Array.isArray(saved.ollNames) ? saved.ollNames.filter((name: unknown): name is string => typeof name === 'string' && known.has(name)) : [] :
    customOlls.length ? [customOlls[0].id] : [];
  return { customOlls, ollNames };
}

export function selectedOllPool(builtin: OpItem[], custom: CustomOll[], selected: string[]): OpItem[] {
  if (!selected.length) return builtin;
  return [...builtin.filter(item => selected.indexOf(item.name) >= 0),
    ...custom.filter(item => selected.indexOf(item.id) >= 0).map(customOllItem)];
}
