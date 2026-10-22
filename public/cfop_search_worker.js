import init, * as wasm from './cube_cross_solve.js?v=20261022-xxcross';

let ready;
let jointReady;
function initialize() {
  if (!ready) ready = (async () => {
    await init(new URL('./cube_cross_solve_bg.wasm?v=20261022-xxcross', import.meta.url));
    const response = await fetch(new URL('./cube_cross_table.bin', import.meta.url));
    if (!response.ok) throw new Error(`十字表加载失败：HTTP ${response.status}`);
    wasm.load_table_from_bytes(new Uint8Array(await response.arrayBuffer()));
  })();
  return ready;
}

async function initializeJoint() {
  if (jointReady) return jointReady;
  jointReady = (async () => {
    const response = await fetch(new URL('./joint_table.bin', import.meta.url));
    if (response.ok) {
      try {
        wasm.load_joint_table_from_bytes(new Uint8Array(await response.arrayBuffer()));
        return;
      } catch (error) { console.warn('联合表无效，在 Worker 内重新生成', error); }
    }
    wasm.get_joint_table_bytes();
  })();
  return jointReady;
}

self.onmessage = async ({data}) => {
  const {id, operation, payload = {}} = data || {};
  try {
    await initialize();
    if (operation === 'stages' || operation === 'full' ||
      operation === 'start' && !['AUTO', 'CROSS', 'READY'].includes(payload.mode)) await initializeJoint();
    let result;
    switch (operation) {
      case 'start': result = wasm.cfop_start_js(payload.input, payload.mode, payload.maxSolutions, payload.maxDepth); break;
      case 'stages': result = wasm.cfop_stages_js(payload.input, payload.prefix, payload.maxDepth, payload.perSlot); break;
      case 'full': result = wasm.cfop_auto_f2l_js(payload.input, payload.prefix, payload.maxDepth, payload.allowedActions, false); break;
      case 'verify': result = wasm.cfop_verify_js(payload.input, payload.prefix); break;
      default: throw new Error(`未知 CFOP 操作：${operation}`);
    }
    self.postMessage({id, ok: true, result});
  } catch (error) {
    self.postMessage({id, ok: false, error: String(error)});
  }
};
