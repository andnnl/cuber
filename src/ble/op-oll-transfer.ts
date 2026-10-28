import { OpItem } from './op-case';
import { CustomOll, customOllItem } from './op-custom-oll';
import { parseOpFormula } from './op-formula';

export type OllTransferFormat = 'json' | 'txt';
export type OllMergeResult = { items: CustomOll[]; added: number; skipped: number; renamed: number };
const MAX_ITEMS = 100;
const MAX_FILE_LENGTH = 1024 * 1024;

export function exportCustomOlls(items: CustomOll[], format: OllTransferFormat): string {
  if (format === 'json') return JSON.stringify({ version: 1,
    items: items.map(({ name, origin }) => ({ name, origin })) }, null, 2) + '\n';
  if (format === 'txt') return items.map(item => `${item.name}|${item.origin}`).join('\n') + (items.length ? '\n' : '');
  throw Error('不支持的导出格式');
}

function parseTransfer(text: string, format: OllTransferFormat): Array<{ name: string; origin: string }> {
  if (text.length > MAX_FILE_LENGTH) throw Error('文件过大（上限 1 MiB）');
  if (format === 'json') {
    let payload: any;
    try { payload = JSON.parse(text); } catch { throw Error('JSON 格式错误'); }
    if (payload?.version !== 1 || !Array.isArray(payload.items)) throw Error('JSON 版本或数据格式不支持');
    return payload.items;
  }
  if (format !== 'txt') throw Error('不支持的导入格式');
  let unnamed = 0;
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim()).map(line => {
    const separator = line.indexOf('|');
    if (separator < 0) return { name: `导入 OLL ${++unnamed}`, origin: line.trim() };
    return { name: line.slice(0, separator).trim(), origin: line.slice(separator + 1).trim() };
  });
}

/** Validates every entry before returning; caller persists only after this succeeds. */
export function mergeCustomOlls(existing: CustomOll[], text: string, format: OllTransferFormat,
  validate?: (item: OpItem) => void): OllMergeResult {
  const raw = parseTransfer(text, format);
  if (!raw.length) throw Error('文件没有可导入的公式');
  const parsed = raw.map((entry, index) => {
    if (!entry || typeof entry.name !== 'string' || typeof entry.origin !== 'string')
      throw Error(`第 ${index + 1} 条格式错误`);
    const name = entry.name.trim(), origin = entry.origin.trim();
    if (!name || name.length > 40 || name.includes('|')) throw Error(`第 ${index + 1} 条名称无效（最多 40 字）`);
    const item: CustomOll = { id: 'custom-import', name, origin };
    const key = parseOpFormula(origin).moves.join(' ');
    validate?.(customOllItem(item));
    return { name, origin, key };
  });
  const items = existing.slice();
  const formulas = new Set(existing.map(item => parseOpFormula(item.origin).moves.join(' ')));
  const names = new Set(existing.map(item => item.name));
  const ids = new Set(existing.map(item => item.id));
  let added = 0, skipped = 0, renamed = 0;
  const stamp = Date.now().toString(36);
  for (const entry of parsed) {
    if (formulas.has(entry.key)) { skipped++; continue; }
    if (items.length >= MAX_ITEMS) throw Error(`自定义 OLL 最多保存 ${MAX_ITEMS} 条，导入未写入`);
    let name = entry.name;
    if (names.has(name)) {
      for (let suffix = 2; ; suffix++) {
        const tail = ` (${suffix})`;
        name = entry.name.slice(0, 40 - tail.length) + tail;
        if (!names.has(name)) break;
      }
      renamed++;
    }
    let id = `custom-${stamp}-${added + 1}`;
    while (ids.has(id)) id += '-1';
    items.push({ id, name, origin: entry.origin });
    ids.add(id); names.add(name); formulas.add(entry.key); added++;
  }
  return { items, added, skipped, renamed };
}
