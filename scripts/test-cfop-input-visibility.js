const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2015}}).outputText;
  module._compile(output, filename);
};
const {normalizeCfopScramble} = require('../src/vue/CfopLearning/scramble.ts');
const {visiblePieceSignatures} = require('../src/vue/CfopLearning/visibility-targets.ts');
const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
assert.equal(normalizeCfopScramble(' R  U2  z2 '), 'R U2 z2');
assert.equal(normalizeCfopScramble(solved), solved);
for (const invalid of ['', 'R Q', 'Rz2', 'z2 R', 'R3', 'R2\nF garbage', 'U'.repeat(54)])
  assert.throws(() => normalizeCfopScramble(invalid), /打乱公式/);

const targets = [];
for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) targets.push(z * 9 + 6 + x);
for (let y = 2; y >= 0; y--) for (let z = 2; z >= 0; z--) targets.push(z * 9 + y * 3 + 2);
for (let y = 2; y >= 0; y--) for (let x = 0; x < 3; x++) targets.push(18 + y * 3 + x);
for (let z = 2; z >= 0; z--) for (let x = 0; x < 3; x++) targets.push(z * 9 + x);
for (let y = 2; y >= 0; y--) for (let z = 0; z < 3; z++) targets.push(z * 9 + y * 3);
for (let y = 2; y >= 0; y--) for (let x = 2; x >= 0; x--) targets.push(y * 3 + x);
const segment = (slot, start, end) => ({slot, start, end, moves:[]});
const route = {input:'R U', moves:['R', 'U', 'F'], frames:Array.from({length:4}, () => ({facelets:solved,slots:[]})), segments:[
  {label:'十字', start:0, end:1, moves:['R']}, segment('FR',1,2), segment('FL',2,3),
]};
const cross = visiblePieceSignatures(route, 0, targets);
assert.deepStrictEqual([...cross].sort(), ['BD','DF','DL','DR'].sort());
for (const [name, slots] of [['XCROSS',['FR']], ['XXCROSS',['FR','BL']],
  ['XXXCROSS',['FR','BL','FL']]]) {
  const firstStage = {...route, frames:route.frames.map((frame, index) => ({...frame,
    slots:index === 1 ? slots : [],
  }))};
  const visible = visiblePieceSignatures(firstStage, 0, targets);
  for (const slot of slots) {
    assert.ok(visible.has([...'D'+slot].sort().join('')), `${name} 十字阶段丢失 ${slot} 角块`);
    assert.ok(visible.has([...slot].sort().join('')), `${name} 十字阶段丢失 ${slot} 棱块`);
  }
  assert.equal(visible.size, 4 + slots.length * 2, `${name} 十字阶段目标块数`);
}
const f2l = visiblePieceSignatures(route, 1, targets);
for (const piece of ['BD','DF','DL','DR','DFR','FR','DFL','FL']) assert.ok(f2l.has(piece), piece);
assert.equal(f2l.size, 8);
route.frames[2].slots = ['FR'];
const second = visiblePieceSignatures(route, 2, targets);
assert.ok(second.has('DFR') && second.has('FR'), '已完成组仍可见');
const z2route = {...route, input:'R z2', frames:route.frames.map(frame => ({...frame,
  facelets:frame.facelets.replace(/[URDL]/g, char => ({U:'D',D:'U',R:'L',L:'R'})[char]),
}))};
const z2cross = visiblePieceSignatures(z2route, 0, targets);
assert.deepStrictEqual([...z2cross].sort(), ['BU','FU','LU','RU'].sort());
z2route.frames[1].slots = ['FR'];
const z2Xcross = visiblePieceSignatures(z2route, 0, targets);
assert.ok(z2Xcross.has('FLU') && z2Xcross.has('FL'), 'z2 的 XCross 角棱应按实体颜色保留');
assert.equal(visiblePieceSignatures(z2route, 1, targets).size, 8);
const template = fs.readFileSync(path.join(root, 'src/vue/CfopLearning/index.html'), 'utf8');
for (const text of ['按公式打乱', '半透明', '隐藏无关']) assert.ok(template.includes(text), text);
console.log('CFOP formula and stage visibility verified');
