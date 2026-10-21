const assert = require('assert');
const { BackgroundStore, normalize } = require('../.tmp/background/background-store.js');

function memory(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

assert.strictEqual(normalize('#abcdef'), '#ABCDEF');
assert.strictEqual(normalize('red'), null);
assert.strictEqual(normalize('#abc'), null);
const storage = memory([['bleBackgroundColor', '#aabbcc']]);
const bg = new BackgroundStore(storage);
assert.strictEqual(bg.mode('blecross'), 'custom');
assert.strictEqual(bg.effective('blecross', '#FFFFFF'), '#AABBCC');
assert.strictEqual(bg.effective('cfop', '#EEF1F7'), '#EEF1F7');
bg.setMode('blecross', 'global');
assert.strictEqual(new BackgroundStore(storage).effective('blecross', '#FFFFFF'), '#FFFFFF');
bg.setGlobal('#123456');
assert.strictEqual(bg.effective('cfop', '#EEF1F7'), '#123456');
assert.strictEqual(bg.effective('blecross', '#FFFFFF'), '#123456');
bg.setCustom('blecross', '#665544');
assert.strictEqual(bg.effective('blecross', '#FFFFFF'), '#665544');
assert.strictEqual(bg.effective('cfop', '#EEF1F7'), '#123456');
assert.strictEqual(bg.effective('fixedcases', '#FFFFFF'), '#665544');
bg.setMode('blecross', 'global');
bg.setMode('blecross', 'custom');
assert.strictEqual(bg.effective('blecross', '#FFFFFF'), '#123456', '切回自定义应从当前有效色开始');

let notifications = 0;
const unsubscribe = bg.subscribe(() => notifications++);
bg.setGlobal('#234567');
assert.strictEqual(notifications, 1);
unsubscribe();
bg.setGlobal(null);
assert.strictEqual(notifications, 1);
assert.strictEqual(storage.getItem('cubeBackground.global'), null);

storage.setItem('cubeBackground.global', 'broken');
bg.reload();
assert.strictEqual(bg.effective('cfop', '#EEF1F7'), '#EEF1F7');

const failing = memory();
failing.setItem = () => { throw Error('quota'); };
failing.removeItem = () => { throw Error('quota'); };
const ephemeral = new BackgroundStore(failing);
ephemeral.setGlobal('#010203');
ephemeral.setCustom('cfop', '#030201');
assert.strictEqual(ephemeral.effective('cfop', '#EEF1F7'), '#030201');
ephemeral.setMode('cfop', 'global');
assert.strictEqual(ephemeral.effective('cfop', '#EEF1F7'), '#010203');
console.log('background store: passed');
