const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const load = (file, deps = {}) => {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2018}}).outputText;
  const target = {exports:{}};
  new Function('module', 'exports', 'require', code)(target, target.exports, name => deps[name] || require(name));
  return target.exports;
};
const notation = load('src/vue/CfopLearning/notation.ts');
const follow = load('src/vue/CfopLearning/follow.ts', {'./notation':notation,
  '../../ble/move-diff':require('../.tmp/ble/move-diff.js')});
const {applyFaceletMove} = require('../.tmp/ble/move-diff.js');
const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const afterR = applyFaceletMove(solved, 'R');
const route = {moves:['R'], frames:[{facelets:solved}, {facelets:afterR}]};
const start = follow.startFollow(route, {facelets:solved, generation:1, lastMoveSerial:6});
assert.equal(start.status, 'ready');
assert.equal(follow.startFollow(route, {facelets:afterR, generation:1}).status, 'blocked');
const duplicate = follow.reduceFollow(start, {type:'move', move:'R', serial:6});
assert.equal(duplicate.cursor, 0);
const wrong = follow.reduceFollow(start, {type:'move', move:'U', serial:7});
assert.equal(wrong.status, 'paused');
assert.equal(wrong.cursor, 0);
assert.equal(wrong.actual, applyFaceletMove(solved, 'U'));
const restored = follow.reduceFollow(wrong, {type:'move', move:"U'", serial:8});
assert.equal(restored.status, 'ready');
const done = follow.reduceFollow(restored, {type:'move', move:'R', serial:9});
assert.equal(done.status, 'complete');
assert.equal(done.cursor, 1);
assert.equal(follow.reduceFollow(start, {type:'move', move:'R', serial:9, recovered:true}).cursor, 0);
const afterR2 = applyFaceletMove(afterR, 'R');
const double = follow.startFollow({moves:['R2'], frames:[{facelets:solved},{facelets:afterR2}]},
  {facelets:solved, generation:1, lastMoveSerial:10});
const halfway = follow.reduceFollow(double, {type:'move', move:'R', serial:11});
assert.equal(halfway.status, 'ready');
assert.equal(halfway.cursor, 0);
assert.equal(halfway.actual, afterR);
const completed = follow.reduceFollow(halfway, {type:'move', move:'R', serial:12});
assert.equal(completed.status, 'complete');
assert.equal(completed.cursor, 1);
const badHalf = follow.reduceFollow(halfway, {type:'move', move:"R'", serial:12});
assert.equal(badHalf.status, 'ready');
assert.equal(badHalf.cursor, 0);
assert.equal(follow.reduceFollow(badHalf, {type:'move', move:'R', serial:13}).partial, true);
const view = {moves:['y','R'], frames:[{facelets:solved},{facelets:solved},{facelets:applyFaceletMove(solved,'F')}]};
assert.equal(follow.startFollow(view, {facelets:solved, generation:1}).status, 'view');
assert.throws(() => follow.confirmView(start), /视角/);
const confirmedView = follow.confirmView(follow.startFollow(view, {facelets:solved, generation:2}));
assert.equal(confirmedView.cursor, 1);
assert.equal(follow.reduceFollow(confirmedView, {type:'move', move:'F', serial:1}).status, 'complete');
const switched = follow.startFollow({moves:["U'"], frames:[{facelets:afterR},{facelets:applyFaceletMove(afterR,"U'")}]},
  {facelets:afterR, generation:3, lastMoveSerial:20});
assert.equal(switched.cursor, 0);
assert.equal(follow.reduceFollow(switched, {type:'move', move:"U'", serial:19}).cursor, 0);
assert.equal(follow.pauseFollow(switched, '断线').status, 'paused');
const slice = follow.startFollow({moves:['S'], frames:[{facelets:solved},{facelets:solved}]},
  {facelets:solved, generation:1});
assert.equal(follow.reduceFollow(slice, {type:'move', move:'R', serial:1}).status, 'blocked');
console.log('CFOP physical-follow correction verified');
