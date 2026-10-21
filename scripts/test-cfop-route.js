const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const file = path.join(__dirname, '../src/vue/CfopLearning/route.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS},
}).outputText;
const target = {exports: {}};
new Function('module', 'exports', code)(target, target.exports);
const {buildRoute} = target.exports;
const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const frame = slots => ({facelets: solved, slots, cross_solved: true});
const frames = [frame([]), frame([]), frame(['FR']), frame(['FR']), frame(['FR', 'BL'])];
const stages = [
  {target:'Cross', moves:['R','U']},
  {target:'F2L 全段', moves:["U'", 'L'], segments:[
    {start_step:1, end_step:2, completed_slots:['BL'], restored_slots:[]},
  ]},
];
const route = buildRoute(solved, stages, frames);
assert.deepStrictEqual(route.segments.map(x => [x.label, x.start, x.end]), [
  ['十字', 0, 2], ['第 1 组 F2L · FR（首阶段已完成）', 2, 2],
  ['第 2 组 F2L · BL', 2, 4],
]);
assert.deepStrictEqual(route.segments.map(x => x.slot || null), [null, 'FR', 'BL']);
assert.deepStrictEqual(route.moves, ['R','U',"U'",'L']);
const xcross = buildRoute(solved, [{target:'XXCross', moves:[]}], [frame(['FR', 'BL'])]);
assert.deepStrictEqual(xcross.segments.map(x => [x.label, x.start, x.end]), [
  ['十字', 0, 0], ['第 1 组 F2L · FR（首阶段已完成）', 0, 0],
  ['第 2 组 F2L · BL（首阶段已完成）', 0, 0],
]);
const xxxcross = buildRoute(solved, [{target:'XXXCross', moves:[]}], [frame(['FR', 'BL', 'FL'])]);
assert.equal(xxxcross.segments.length, 4);
const simultaneous = buildRoute(solved, [
  {target:'Cross', moves:[]},
  {target:'F2L 全段', moves:['R'], segments:[
    {start_step:1, end_step:1, completed_slots:['FR','FL'], restored_slots:[]},
  ]},
], [frame([]), frame(['FR','FL'])]);
assert.deepStrictEqual(simultaneous.segments.map(x => [x.start, x.end]), [[0,0],[0,1],[0,1]]);
assert.deepStrictEqual(simultaneous.segments.map(x => x.slot || null), [null,'FR','FL']);
assert.throws(() => buildRoute(solved, stages, frames.slice(1)), /帧数/);
assert.throws(() => buildRoute(solved, [{target:'Cross', moves:['Q']}], [frame([]), frame([])]), /动作/);
console.log('CFOP route segments verified');
