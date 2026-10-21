const assert = require('assert');
const fs = require('fs');
const path = require('path');
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
console.log('宽转资源与 WASM API 检查通过');

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
  assert.strictEqual(wideToPhysicalMove('u', true), 'd');
  assert.strictEqual(wideToPhysicalMove("u'", true), "d'");
  assert.strictEqual(wideToPhysicalMove('F', true), 'F');
  assert.strictEqual(wideToPhysicalMove("B'", true), "B'");
  assert.strictEqual(wideToPhysicalMove('R', true), 'L');
  assert.strictEqual(wideToPhysicalMove('u', false), 'u');
  const { gripTokens, displayWideGripRoute } = loadTs('src/vue/CrossF2LTrainer/wide-grip.ts');
  assert.deepStrictEqual(gripTokens(['u', "u'", 'R2']), ['Uw', "Uw'", 'R2']);
  assert.deepStrictEqual(gripTokens(['d', "d'", 'L']), ['Uw', "Uw'", 'L']);
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
}

function playbackContract() {
  const { applyWideFormulaFrom, isWideCrossSolved, correctWideCross } = loadTs('src/vue/CrossF2LTrainer/wide-playback.ts');
  const { applyFaceletMove } = loadTs('src/ble/move-diff.ts');
  const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  assert.strictEqual(applyWideFormulaFrom(solved, ['u', "u'"]), solved);
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

clientContract().then(() => console.log('独立 Worker 取消与旧帧隔离通过'));
