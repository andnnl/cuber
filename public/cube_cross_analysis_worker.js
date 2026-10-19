import init, * as wasm from './cube_cross_solve.js?v=20261020-grip-routes';
import { recommendExistingViews } from './multi-view-grip.js';

let ready;
let jointReady = false;
const JOINT_CACHE = 'joint_table_v2';

async function cacheJoint(bytes) {
  if (!self.indexedDB) return;
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('CubeCrossAnalysis', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('tables');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const cached = await new Promise((resolve, reject) => {
      const tx = db.transaction('tables', bytes ? 'readwrite' : 'readonly');
      const request = bytes ? tx.objectStore('tables').put(bytes, JOINT_CACHE)
        : tx.objectStore('tables').get(JOINT_CACHE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return cached;
  } catch (error) {
    console.warn('联合表缓存不可用:', error);
    return null;
  }
}

async function ensureReady() {
  if (!ready) ready = (async () => {
    await init(new URL('./cube_cross_solve_bg.wasm?v=20261020-grip-routes', import.meta.url));
    const response = await fetch(new URL('./cube_cross_table.bin', import.meta.url));
    if (!response.ok) throw new Error(`Cross 搜索表加载失败：HTTP ${response.status}`);
    wasm.load_table_from_bytes(new Uint8Array(await response.arrayBuffer()));
  })();
  return ready;
}

async function ensureJointTable() {
  if (jointReady) return;
  let bytes = await cacheJoint();
  if (!bytes) {
    const response = await fetch(new URL('./joint_table.bin', import.meta.url));
    if (response.ok) bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (bytes) {
    try { wasm.load_joint_table_from_bytes(bytes); jointReady = true; }
    catch (error) { console.warn('联合距离表无效，Worker 内重建:', error); }
  }
  if (!jointReady) {
    bytes = wasm.get_joint_table_bytes();
    jointReady = true;
  }
  if (bytes) await cacheJoint(bytes);
}

self.onmessage = async ({ data }) => {
  const { id, operation, payload = {} } = data || {};
  try {
    // 固定公式只需指法评分器，不依赖可能尚未下载的 Cross 距离表。
    if (operation === 'scoreFixedCase') await init(new URL('./cube_cross_solve_bg.wasm?v=20261020-grip-routes', import.meta.url));
    else await ensureReady();
    let result;
    switch (operation) {
      case 'scoreFixedCase':
        result = wasm.score_cross_grip_routes_js(payload.moves, payload.limit || 4);
        break;
      case 'recommendCross':
        result = wasm.recommend_cross_state_js(payload.facelets);
        break;
      case 'solveMultiCross':
        await ensureJointTable();
        result = wasm.solve_multi_cross(payload.facelets, payload.pairCount,
          payload.slots, payload.maxSolutions, payload.maxDepth);
        break;
      case 'scoreExisting':
        result = recommendExistingViews(payload.solutions,
          moves => wasm.score_cross_grip_js(moves));
        break;
      default: throw new Error(`未知分析操作：${operation}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error) });
  }
};
