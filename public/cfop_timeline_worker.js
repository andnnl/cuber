import init, {cfop_verify_js} from './cube_cross_solve.js';

let ready;
self.onmessage = async ({data}) => {
  const {id, input, moves} = data || {};
  try {
    if (!ready) ready = init(new URL('./cube_cross_solve_bg.wasm', import.meta.url));
    await ready;
    const prefix = [];
    const frames = [];
    const append = () => {
      const value = cfop_verify_js(input, prefix);
      frames.push({facelets: value.facelets, slots: value.slots, cross_solved: value.cross_solved});
    };
    append();
    for (const move of moves) { prefix.push(move); append(); }
    self.postMessage({id, ok: true, result: frames});
  } catch (error) {
    self.postMessage({id, ok: false, error: String(error)});
  }
};
