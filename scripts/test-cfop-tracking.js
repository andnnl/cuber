const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/vue/CfopLearning/tracking.ts'), 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const moduleRef = {exports:{}};
new Function('module', 'exports', code)(moduleRef, moduleRef.exports);
const {trackedSlots, findSlotPieces, trackingGroupNumber} = moduleRef.exports;
const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const targets = [];
for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) targets.push(z * 9 + 6 + x);
for (let y = 2; y >= 0; y--) for (let z = 2; z >= 0; z--) targets.push(z * 9 + y * 3 + 2);
for (let y = 2; y >= 0; y--) for (let x = 0; x < 3; x++) targets.push(18 + y * 3 + x);
for (let z = 2; z >= 0; z--) for (let x = 0; x < 3; x++) targets.push(z * 9 + x);
for (let y = 2; y >= 0; y--) for (let z = 0; z < 3; z++) targets.push(z * 9 + y * 3);
for (let y = 2; y >= 0; y--) for (let x = 2; x >= 0; x--) targets.push(y * 3 + x);
const route = {
  moves:['R', 'U', 'F', 'L', 'D'],
  segments:[
    {label:'十字', start:0, end:1, moves:['R']},
    {label:'第 1 组 F2L · FR（首阶段已完成）', slot:'FR', start:1, end:1, moves:[]},
    {label:'第 2 组 F2L · FL', slot:'FL', start:1, end:3, moves:['U', 'F']},
    {label:'第 3 组 F2L · BL', slot:'BL', start:3, end:4, moves:['L']},
    {label:'第 4 组 F2L · BR', slot:'BR', start:4, end:5, moves:['D']},
  ],
};
assert.deepStrictEqual(trackedSlots(route, 0), {current:null, next:'FL'});
assert.deepStrictEqual(trackedSlots(route, 1), {current:'FL', next:'BL'});
assert.deepStrictEqual(trackedSlots(route, 2), {current:'FL', next:'BL'});
assert.deepStrictEqual(trackedSlots(route, 3), {current:'BL', next:'BR'});
assert.deepStrictEqual(trackedSlots(route, 5), {current:null, next:null});
assert.deepStrictEqual(['FR','FL','BL','BR'].map(slot => trackingGroupNumber(route, slot)), [1,2,3,4]);
assert.deepStrictEqual(trackedSlots({segments:[
  {label:'十字', start:0, end:1}, {label:'第 1 组 F2L · FR', slot:'FR', start:3, end:5},
]}, 2), {current:null, next:'FR'});
assert.deepStrictEqual(findSlotPieces(solved, targets, 'FR'), {cornerIndex:20, edgeIndex:23});
assert.deepStrictEqual(findSlotPieces(solved, targets, 'BL'), {cornerIndex:0, edgeIndex:3});
const altered = solved.split('');
const home = targets.reduce((indexes, position, i) => {
  (indexes[position] || (indexes[position] = [])).push(i);
  return indexes;
}, []);
for (const [first, second] of [[20,18],[23,21]]) {
  for (let i = 0; i < home[first].length; i++) {
    const a = home[first][i], b = home[second][i];
    [altered[a], altered[b]] = [altered[b], altered[a]];
  }
}
assert.deepStrictEqual(findSlotPieces(altered.join(''), targets, 'FR'), {cornerIndex:18, edgeIndex:21});
console.log('CFOP F2L tracking verified');
