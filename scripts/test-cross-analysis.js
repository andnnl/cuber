const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};

const { relativeMove, physicalMove, recommendExistingViews, simpleGripInstruction } = require('../src/vue/CrossF2LTrainer/recommendations.ts');
const allMoves = 'U D F B R L'.split(' ').flatMap(face => [face, `${face}'`, `${face}2`]);
for (const front of 'FLBR') {
  for (const move of allMoves) {
    assert.strictEqual(physicalMove(relativeMove(move, front), front), move, `${front}: ${move}`);
  }
}
assert.strictEqual(relativeMove("R'", 'L'), "F'");
const views = recommendExistingViews([
  { moves: ['R', 'U'], slots: ['FR'] },
  { moves: ['R', 'U'], slots: ['BL'] },
], () => ({ score: 1, regrips: 0, steps: [] }));
assert.strictEqual(views.find(view => view.front === 'F').solutions.length, 1);
assert.deepStrictEqual(views.find(view => view.front === 'F').solutions[0].slots, ['FR', 'BL']);
assert.deepStrictEqual(views.find(view => view.front === 'L').solutions[0].physicalMoves, ['R', 'U']);
assert.strictEqual(simpleGripInstruction({ movement: 'R', instruction: '右食指；动作后左拇指扶稳' }), 'R：右食指');
console.log('cross analysis mapping OK');

const { remainingSlots, predictionMustReset, verifySolvedTargets } = require('../src/vue/CrossF2LTrainer/training-targets.ts');
assert.deepStrictEqual(remainingSlots(['FR', 'BL']), ['FL', 'BR']);
assert.deepStrictEqual(remainingSlots(['FR', 'FL', 'BL']), ['BR']);
assert.strictEqual(predictionMustReset('FR', ['FR', 'FL']), true);
assert.strictEqual(predictionMustReset('BL', ['FR', 'FL']), false);
const solved = 'U'.repeat(9) + 'R'.repeat(9) + 'F'.repeat(9) + 'D'.repeat(9) + 'L'.repeat(9) + 'B'.repeat(9);
assert.strictEqual(verifySolvedTargets(solved, ['FR', 'BL']).ok, true);
const twisted = solved.split('');
twisted[29] = 'F'; twisted[26] = 'R'; twisted[15] = 'D';
assert.strictEqual(verifySolvedTargets(twisted.join(''), ['FR']).ok, false);
const brokenCross = solved.split('');
brokenCross[28] = 'F'; brokenCross[25] = 'D';
assert.strictEqual(verifySolvedTargets(brokenCross.join(''), []).cross, false);
console.log('cross analysis targets OK');
