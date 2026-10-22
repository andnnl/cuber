import init, * as wasm from "./cube_cross_solve.js?v=20261022-xxcross";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await init(new URL('./cube_cross_solve_bg.wasm?v=20261022-xxcross', import.meta.url));
    initialized = true;
  }
}

self.onmessage = async event => {
  const { id, operation, payload = {} } = event.data || {};
  try {
    await ensureInitialized();
    let result;
    let transfer = [];
    switch (operation) {
      case "init":
        result = true;
        break;
      case "loadTable":
        wasm.load_table_from_bytes(new Uint8Array(payload.buffer));
        result = true;
        break;
      case "generateTable":
        wasm.generate_table(payload.maxDepth);
        result = true;
        break;
      case "getTableBytes": {
        const bytes = new Uint8Array(wasm.get_table_bytes());
        const copy = bytes.slice();
        result = copy.buffer;
        transfer = [result];
        break;
      }
      case "isTableLoaded":
        result = wasm.is_table_loaded();
        break;
      case "solveMulti":
        result = wasm.solve_multi(payload.scramble, payload.maxSolutions);
        break;
      case "solveXCross":
        result = wasm.solve_xcross(payload.scramble, payload.slot, payload.maxSolutions);
        break;
      case "getTableStats":
        result = wasm.get_table_stats();
        break;
      default:
        throw new Error(`未知 Worker 操作: ${operation}`);
    }
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
