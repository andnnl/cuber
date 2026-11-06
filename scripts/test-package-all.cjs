const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/package-all.sh');

function run(...args) {
  return spawnSync('bash', [script, ...args], { cwd: root, encoding: 'utf8' });
}

for (const [platform, expected, absent] of [
  ['all', ['desktop:linux', 'desktop:windows', 'android:debug', 'android:release'], []],
  ['windows', ['desktop:windows'], ['desktop:linux', 'android:debug']],
  ['linux', ['desktop:linux'], ['desktop:windows', 'android:debug']],
  ['android', ['android:debug', 'android:release'], ['desktop:linux', 'desktop:windows']],
]) {
  const result = run('--dry-run', platform);
  assert.strictEqual(result.status, 0, `${platform}: ${result.stderr}`);
  const output = result.stdout;
  assert.strictEqual((output.match(/web:build/g) || []).length, 1, platform);
  assert.strictEqual((output.match(/web:table/g) || []).length, 1, platform);
  for (const label of expected) assert(output.includes(label), `${platform}: missing ${label}`);
  for (const label of absent) assert(!output.includes(label), `${platform}: unexpected ${label}`);
  if (platform === 'android' || platform === 'all') {
    assert(output.includes('Cuber-1.0.16-android-debug.apk'));
    assert(output.includes('Cuber-1.0.16-android-release.apk'));
  }
}

assert.notStrictEqual(run('unknown').status, 0);
assert.strictEqual(run('--help').status, 0);
console.log('package-all 命令选择与产物命名测试通过');
