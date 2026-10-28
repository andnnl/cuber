import { OpItem } from './op-case';
import { CustomOll, restoreCustomOlls } from './op-custom-oll';

export const CUSTOM_OLL_LIBRARY_KEY = 'cuberCustomOllLibrary';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** One shared source of custom OLLs; migrate the old trainer data only once. */
export function loadCustomOllLibrary(storage: StorageLike, builtin: OpItem[],
  validate?: (item: OpItem) => void): CustomOll[] {
  const current = storage.getItem(CUSTOM_OLL_LIBRARY_KEY);
  if (current !== null) {
    const data = JSON.parse(current);
    if (data?.version !== 1 || !Array.isArray(data.items)) throw Error('自定义 OLL 公式库数据格式不支持');
    return restoreCustomOlls({ customOlls: data.items }, builtin, validate).customOlls;
  }
  const legacy = JSON.parse(storage.getItem('seamlessOpSettings') || '{}');
  const items = restoreCustomOlls(legacy, builtin, validate).customOlls;
  saveCustomOllLibrary(storage, items);
  return items;
}

export function saveCustomOllLibrary(storage: StorageLike, items: CustomOll[]): void {
  storage.setItem(CUSTOM_OLL_LIBRARY_KEY, JSON.stringify({ version: 1, items }));
}
