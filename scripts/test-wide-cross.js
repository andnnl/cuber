const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ts = require('typescript');

const root = path.join(__dirname, '..');
for (const name of ['cube_cross_solve.js', 'cube_cross_solve_bg.wasm',
  'cross_wide_table.bin', 'cube_cross_wide_worker.js']) {
  assert.ok(fs.existsSync(path.join(root, 'public', name)), `缺少宽转资源：${name}`);
}
const glue = fs.readFileSync(path.join(root, 'public/cube_cross_solve.js'), 'utf8');
assert.match(glue, /export function recommend_wide_cross_cached_js\(/);
assert.match(glue, /export function recommend_wide_cross_js\(/);
assert.match(glue, /export function score_wide_grip_js\(/);
for (const page of ['CrossF2LTrainer', 'BleCrossTrainer']) {
  const html = fs.readFileSync(path.join(root, 'src/vue', page, 'index.html'), 'utf8');
  assert.match(html, /r\/r'\/r2/, `${page} 应提示右宽转候选`);
}
console.log('宽转资源与 WASM API 检查通过');

async function wasmContract() {
  const table = fs.readFileSync(path.join(root, 'public/cross_wide_table.bin'));
  assert.strictEqual(table.subarray(0, 8).toString(), 'CWIDE002');
  const wasm = await import(pathToFileURL(path.join(root, 'public/cube_cross_solve.js')).href);
  await wasm.default(new Uint8Array(fs.readFileSync(path.join(root, 'public/cube_cross_solve_bg.wasm'))));
  for (const [wide, outer] of [['r', 'R'], ["r'", "R'"], ['r2', 'R2']]) {
    const actual = wasm.score_wide_grip_js([wide]);
    const baseline = wasm.score_wide_grip_js([outer]);
    assert.strictEqual(actual.score, baseline.score, `${wide} 的评分应按 ${outer}`);
    assert.strictEqual(actual.regrips, baseline.regrips, `${wide} 的换握应按 ${outer}`);
  }
  const { applyWideFormulaFrom, correctWideCross } = loadTs('src/vue/CrossF2LTrainer/wide-playback.ts');
  const state = applyWideFormulaFrom('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', ['R', 'U', 'F']);
  const result = wasm.recommend_wide_cross_cached_js(state, new Uint8Array(table));
  const { parseWideRecommendations } = loadTs('src/vue/CrossF2LTrainer/wide-recommendations.ts');
  const solutions = parseWideRecommendations(state, result).buckets.flatMap(bucket => bucket.solutions);
  assert.ok(solutions.length > 0, '搜索应返回候选');
  assert.ok(solutions.some(item => item.moves.some(move => move.startsWith('r'))), '搜索应实际返回 r 候选');
  assert.ok(solutions.some(item => item.moves.some(move => move.startsWith('r'))
    && correctWideCross(state, item.physicalMoves)), 'r 候选应可以实际重放');
  // This state yields 12 cached candidates but none passes the sticker-level cross check.
  const missedState = applyWideFormulaFrom('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB',
    "F' B' L2 F' D' L D' F B2 F B' F F' U' F2 L2 B' F U D'".split(' '));
  const missed = parseWideRecommendations(missedState, wasm.recommend_wide_cross_cached_js(missedState, new Uint8Array(table)));
  assert.equal(missed.buckets.flatMap(bucket => bucket.solutions).filter(item => correctWideCross(missedState, item.physicalMoves)).length, 0);
  const crossTable = path.join(root, 'dist/cube_cross_table.bin');
  if (fs.existsSync(crossTable)) wasm.load_table_from_bytes(new Uint8Array(fs.readFileSync(crossTable)));
  else wasm.generate_table(8);
  const { recoverWideCross } = loadTs('src/vue/CrossF2LTrainer/wide-recommendations.ts');
  const recovered = await recoverWideCross(missedState, s => Promise.resolve(wasm.recommend_cross_state_js(s)),
    applyWideFormulaFrom);
  for (const move of ['l', "l'", 'l2']) {
    assert.ok(recovered.some(item => item.physicalMoves.includes(move) &&
      correctWideCross(missedState, item.physicalMoves)), `缓存候选全部淘汰时仍需找到可播放的 ${move} 宽转解法`);
  }
}

function loadTs(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports;
}

function recommendationContract() {
  const { parseWideRecommendations, mapWideMove, wideToPhysicalMove } =
    loadTs('src/vue/CrossF2LTrainer/wide-recommendations.ts');
  const facelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  const route = { score: 7, regrips: 0, steps: [{ movement: 'u', instruction: '上两层' }] };
  const raw = { limited: true, buckets: [
    { front: 'F', solutions: [{ moves: ['u', 'R', "u'"], back_turns: 0, route }] },
    { front: 'L', solutions: [] }, { front: 'B', solutions: [] }, { front: 'R', solutions: [] },
  ] };
  const parsed = parseWideRecommendations(facelets, raw);
  assert.strictEqual(parsed.limited, true);
  assert.deepStrictEqual(parsed.buckets[0].solutions[0].moves, ['u', 'R', "u'"]);
  assert.deepStrictEqual(parsed.buckets[0].solutions[0].physicalMoves, ['u', 'R', "u'"]);
  const rightWide = { ...raw, buckets: [
    { front: 'F', solutions: [{ moves: ['r', "r'", 'r2'], back_turns: 0, route }] },
    { front: 'L', solutions: [{ moves: ['r'], back_turns: 0, route }] },
    { front: 'B', solutions: [{ moves: ["r'"], back_turns: 0, route }] },
    { front: 'R', solutions: [{ moves: ['r2'], back_turns: 0, route }] },
  ] };
  const mappedRight = parseWideRecommendations(facelets, rightWide);
  assert.deepStrictEqual(mappedRight.buckets.map(bucket => bucket.solutions[0].physicalMoves),
    [['r', "r'", 'r2'], ['f'], ["l'"], ['b2']]);
  for (const move of ['l', "l'", 'l2']) {
    const direct = { ...raw, buckets: [
      { front: 'F', solutions: [{ moves: [move], back_turns: 0, route }] },
      { front: 'L', solutions: [] }, { front: 'B', solutions: [] }, { front: 'R', solutions: [] },
    ] };
    assert.deepStrictEqual(parseWideRecommendations(facelets, direct).buckets[0].solutions[0].physicalMoves, [move],
      `${move} 宽转候选不能在界面解析时丢失`);
  }
  assert.throws(() => parseWideRecommendations('bad', raw), /54/);
  assert.throws(() => parseWideRecommendations(facelets, { ...raw, buckets: [{ front: 'F', solutions: [
    { moves: ['u', 'Q'], back_turns: 0, route },
  ] }] }), /记号|候选/);
  assert.throws(() => parseWideRecommendations(facelets, { ...raw, buckets: [{ front: 'F', solutions: [
    { moves: ['R'], back_turns: 0, route },
  ] }] }), /宽转/);
  assert.strictEqual(mapWideMove('u', { U: 'D' }), 'd');
  assert.strictEqual(mapWideMove("u'", { U: 'U' }), "u'");
  assert.strictEqual(mapWideMove('R2', { R: 'L' }), 'L2');
  assert.strictEqual(mapWideMove("r'", { R: 'F' }), "f'");
  assert.strictEqual(mapWideMove('r2', { R: 'B' }), 'b2');
  assert.strictEqual(wideToPhysicalMove("r'", true), "l'");
  assert.strictEqual(wideToPhysicalMove('u', true), 'd');
  assert.strictEqual(wideToPhysicalMove("u'", true), "d'");
  assert.strictEqual(wideToPhysicalMove('F', true), 'F');
  assert.strictEqual(wideToPhysicalMove("B'", true), "B'");
  assert.strictEqual(wideToPhysicalMove('R', true), 'L');
  assert.strictEqual(wideToPhysicalMove('u', false), 'u');
  const { gripTokens, displayWideGripRoute } = loadTs('src/vue/CrossF2LTrainer/wide-grip.ts');
  assert.deepStrictEqual(gripTokens(['u', "u'", 'R2']), ['Uw', "Uw'", 'R2']);
  assert.deepStrictEqual(gripTokens(['d', "d'", 'L']), ['Uw', "Uw'", 'L']);
  assert.deepStrictEqual(gripTokens(['r', "f'", 'l2', 'b']), ['r', "r'", 'r2', 'r']);
  const scored = { score: 5.4, regrips: 0, start_left: '中立', start_right: '下起手', steps: [
    { movement: 'Uw', instruction: '上两层拨动 u' }, { movement: 'R2', instruction: '右层双拨' },
  ] };
  const mapped = displayWideGripRoute(scored, ['u', 'R2']);
  assert.deepStrictEqual(mapped.steps.map(step => step.movement), ['u', 'R2']);
  assert.strictEqual(mapped.steps[0].instruction.includes('上两层'), true);
  const white = displayWideGripRoute(scored, ['d', 'R2']);
  assert.strictEqual(white.steps[0].movement, 'd');
  assert.match(white.steps[0].instruction, /下两层/);
  assert.strictEqual(white.estimated, true);
  const rightRoute = displayWideGripRoute({ score: 3, regrips: 0, steps: [
    { movement: 'r', instruction: '右手腕向上带动右侧两层 r，手指扶随宽层（触点待核验）' },
  ] }, ['f']);
  assert.strictEqual(rightRoute.steps[0].movement, 'f');
  assert.match(rightRoute.steps[0].instruction, /前面两层/);
  assert.strictEqual(rightRoute.estimated, true);
  const primeRoute = displayWideGripRoute({ score: 3, regrips: 0, steps: [
    { movement: "r'", instruction: "右手带动右侧宽层 r'，触点待核验" },
  ] }, ["l'"]);
  assert.match(primeRoute.steps[0].instruction, /左面宽层 l'，/);
}

function playbackContract() {
  const { applyWideFormulaFrom, isWideCrossSolved, correctWideCross } = loadTs('src/vue/CrossF2LTrainer/wide-playback.ts');
  const { applyFaceletMove } = loadTs('src/ble/move-diff.ts');
  const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  assert.strictEqual(applyWideFormulaFrom(solved, ['u', "u'"]), solved);
  for (const face of ['r', 'f', 'l', 'b']) {
    assert.strictEqual(applyWideFormulaFrom(solved, [face, `${face}'`]), solved);
    assert.strictEqual(applyWideFormulaFrom(solved, [face, face]), applyWideFormulaFrom(solved, [`${face}2`]));
    assert.notStrictEqual(applyWideFormulaFrom(solved, [face]), applyFaceletMove(solved, face.toUpperCase()));
  }
  assert.strictEqual(applyWideFormulaFrom(solved, ['r'])[4], 'F'); // 中层使 F 中心移到 U 中心
  assert.strictEqual(applyWideFormulaFrom('BDLRUBDLDLRFRRUDFBRFFBFDUURLLFUDDRBULFBULLUBBULDRBFRDF', ['u']),
    'DRBLUDDBLULDRBFDFBLRFRRUUURLLFUDDRBURFFBFDUBBLFBULLRDF');
  assert.strictEqual(applyWideFormulaFrom(solved, ['R', "R'"]), solved);
  for (const move of ['U', 'D', 'F', 'B', 'R', 'L', "U'", "D'", 'F2']) {
    assert.strictEqual(applyWideFormulaFrom(solved, [move]), applyFaceletMove(solved, move), `贴纸置换不符: ${move}`);
    const scrambled = 'BDLRUBDLDLRFRRUDFBRFFBFDUURLLFUDDRBULFBULLUBBULDRBFRDF';
    assert.strictEqual(applyWideFormulaFrom(scrambled, [move]), applyFaceletMove(scrambled, move), `打乱态置换不符: ${move}`);
  }
  assert.strictEqual(applyWideFormulaFrom(solved, ['u', 'U', "U'", "u'"]), solved);
  assert.strictEqual(isWideCrossSolved(solved), true);
  assert.strictEqual(isWideCrossSolved(applyWideFormulaFrom(solved, ['u'])), false);
  const caseState = 'URDDUUUDDRRLFRLFLFLBBUFUDURFLUDDDFLUBFBFLBLRRBBRFBRLBD';
  const corrected = correctWideCross(caseState, ['D', "u'", 'R2', 'D', 'F2']);
  assert.deepStrictEqual(corrected, ['D', "u'", 'R2', 'D', 'F2', 'D']);
  assert.strictEqual(isWideCrossSolved(applyWideFormulaFrom(caseState, corrected)), true);
  const other = 'LUBBUULFRDFLBRDUBBFRFLFRDLFRFRUDUUDUDDDLLBLRBULBFBDRRF';
  assert.deepStrictEqual(correctWideCross(other, ["L'", 'u', 'L', "D'", "L'", "D'", "L'", 'D']),
    ["L'", "u'", 'L', "D'", "L'", "D'", "L'", 'D2']);
  assert.throws(() => applyWideFormulaFrom(solved, ['Q']), /记号/);
}

recommendationContract();
playbackContract();
console.log('宽转记号和返回结构校验通过');

async function clientContract() {
  const { WideCrossClient } = loadTs('src/wasm/WideCrossClient.ts');
  const instances = [];
  const previousWorker = global.Worker;
  const previousFetch = global.fetch;
  global.Worker = class {
    terminated = false;
    constructor() { instances.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  };
  try {
    const client = new WideCrossClient();
    const old = client.request('F'.repeat(54));
    const first = instances[0];
    client.cancel();
    await assert.rejects(old, /取消/);
    assert.ok(first.terminated);
    const next = client.request('U'.repeat(54));
    const second = instances[1];
    first.onmessage({ data: { id: first.message.id, ok: true, result: { buckets: [] } } });
    second.onmessage({ data: { id: second.message.id, ok: true, result: { buckets: [1] } } });
    assert.deepStrictEqual(await next, { buckets: [1] });
    client.dispose();
    assert.ok(second.terminated);
    global.fetch = async () => ({ ok: false, status: 404 });
    const missing = new WideCrossClient();
    const failed = missing.request('U'.repeat(54));
    instances[2].onerror({ message: '' });
    await assert.rejects(failed, /HTTP 404.*重启开发服务/);
    missing.dispose();
    const scorer = new WideCrossClient();
    const score = scorer.score([['Uw', 'R']]);
    assert.deepStrictEqual(instances[3].message.operation, 'score');
    assert.deepStrictEqual(instances[3].message.formulas, [['Uw', 'R']]);
    instances[3].onmessage({ data: { id: instances[3].message.id, ok: true, result: [{ steps: [1, 2] }] } });
    assert.deepStrictEqual(await score, [{ steps: [1, 2] }]);
    scorer.dispose();
  } finally {
    global.Worker = previousWorker;
    global.fetch = previousFetch;
  }
}

Promise.all([clientContract(), wasmContract()]).then(() =>
  console.log('独立 Worker、WASM r 指法评分与 CWIDE002 版本校验通过'));
