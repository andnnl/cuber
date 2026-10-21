// 独立宽转搜索：原 Cross 推荐 Worker 不受下载、回退或取消影响。
import init, * as wasm from './cube_cross_solve.js?v=20261020-wide-grip';

self.onmessage = async ({ data }) => {
  const { id, facelets, operation, formulas } = data || {};
  try {
    await init(new URL('./cube_cross_solve_bg.wasm?v=20261020-wide-grip', import.meta.url));
    if (operation === 'score') {
      const result = formulas.map(moves => wasm.score_wide_grip_js(moves));
      self.postMessage({ id, ok: true, result });
      return;
    }
    let result;
    try {
      const response = await fetch(new URL('./cross_wide_table.bin?v=20261020-wide-91d2825', import.meta.url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      result = wasm.recommend_wide_cross_cached_js(facelets, new Uint8Array(await response.arrayBuffer()));
    } catch (error) {
      self.postMessage({ id, stage: 'rebuilding' });
      result = wasm.recommend_wide_cross_js(facelets);
    }
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error) });
  }
};
