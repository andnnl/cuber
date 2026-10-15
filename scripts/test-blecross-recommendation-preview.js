const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 }, fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};

const { baseOpsFaceCharMap } = require('../src/vue/CrossF2LTrainer/pieces.ts');
const { recommendationFrontColor, recommendationFrontTurn } =
  require('../src/vue/BleCrossTrainer/recommendation-preview.ts');

for (const [front, color] of Object.entries({ F: '绿', R: '红', B: '蓝', L: '橙' })) {
  assert.strictEqual(recommendationFrontColor(front, []), color, `${front} 默认正面颜色`);
}
assert.strictEqual(recommendationFrontColor('R', [{ axis: 'z', times: 2 }]), '橙');
assert.strictEqual(recommendationFrontColor('F', [{ axis: 'y', times: 1 }]), '红');
assert.strictEqual(recommendationFrontColor('F', [{ axis: 'y', times: -1 }]), '橙');
assert.strictEqual(recommendationFrontColor('L', [{ axis: 'y', times: 2 }]), '红', 'y2 后 L 朝向实际为红前');
assert.strictEqual(recommendationFrontColor('R', [{ axis: 'z', times: 2 }, { axis: 'y', times: 1 }]), '蓝');

for (const front of ['F', 'R', 'B', 'L']) {
  const turns = recommendationFrontTurn(front);
  const rotated = turns ? baseOpsFaceCharMap([{ axis: 'y', times: turns }]) : baseOpsFaceCharMap([]);
  assert.strictEqual(rotated[front], 'F', `${front} 转正后应为 F 面`);
}
console.log('BLECross recommendation orientation OK');
