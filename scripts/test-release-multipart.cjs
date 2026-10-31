const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cuber-multipart-test-'));
const input = path.join(work, 'Cuber-test-linux-x86_64.AppImage');
const output = path.join(work, 'release');
fs.mkdirSync(output);
try {
  const fd = fs.openSync(input, 'w');
  try {
    fs.writeSync(fd, Buffer.from('begin'));
    fs.writeSync(fd, Buffer.from('ending marker!'), 0, 14, 90 * 1024 * 1024 - 1);
  } finally { fs.closeSync(fd); }

  const build = spawnSync(process.execPath, ['scripts/release-multipart.cjs', input, output], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const repeatBuild = spawnSync(process.execPath, ['scripts/release-multipart.cjs', input, output], { encoding: 'utf8' });
  assert.equal(repeatBuild.status, 0, '相同附件可复用');
  const first = `${input.split('/').pop()}.part00`;
  const second = `${input.split('/').pop()}.part01`;
  assert.equal(fs.statSync(path.join(output, first)).size, 90 * 1024 * 1024);
  assert.equal(fs.statSync(path.join(output, second)).size, 13);
  const expected = createHash('sha256').update(fs.readFileSync(input)).digest('hex');
  const actual = createHash('sha256').update(fs.readFileSync(path.join(output, first))).update(fs.readFileSync(path.join(output, second))).digest('hex');
  assert.equal(actual, expected);
  const unpack = path.join(output, 'Cuber-test-linux-x86_64-unpack.sh');
  const restored = path.join(output, path.basename(input));
  const run = () => spawnSync('sh', [unpack], { encoding: 'utf8', timeout: 30000, env: { ...process.env, CUBER_RELEASE_TEST_SILENT: '1' } });
  assert.equal(run().status, 0, '正确分卷应该可以还原');
  assert.equal(createHash('sha256').update(fs.readFileSync(restored)).digest('hex'), expected);
  assert.notEqual(fs.statSync(restored).mode & 0o111, 0, 'AppImage 应可执行');
  assert.equal(run().status, 0, '重复运行应该识别已有相同文件');
  fs.renameSync(path.join(output, second), path.join(output, `${second}.saved`));
  fs.unlinkSync(restored);
  assert.notEqual(run().status, 0, '缺卷必须失败');
  assert.equal(fs.existsSync(restored), false);
  fs.renameSync(path.join(output, `${second}.saved`), path.join(output, second));
  fs.writeFileSync(path.join(output, second), 'corrupt part');
  assert.notEqual(run().status, 0, '损坏分卷必须失败');
  assert.equal(fs.existsSync(restored), false);
  const conflictingBuild = spawnSync(process.execPath, ['scripts/release-multipart.cjs', input, output], { encoding: 'utf8' });
  assert.notEqual(conflictingBuild.status, 0, '打包器不能覆盖已有的不同附件');
  assert.equal(fs.readFileSync(path.join(output, second), 'utf8'), 'corrupt part');
  fs.writeFileSync(restored, 'existing user file');
  assert.notEqual(run().status, 0, '不可覆盖不同的现存文件');
  assert.equal(fs.readFileSync(restored, 'utf8'), 'existing user file');
  const winInput = path.join(work, 'Cuber-test-win-x64.exe');
  fs.copyFileSync(input, winInput);
  const winOutput = path.join(work, 'windows-release');
  const winBuild = spawnSync(process.execPath, ['scripts/release-multipart.cjs', winInput, winOutput], { encoding: 'utf8' });
  assert.equal(winBuild.status, 0, winBuild.stderr || winBuild.stdout);
  const winEntry = path.join(winOutput, 'Cuber-test-win-x64-unpack.bat');
  const winScript = fs.readFileSync(winEntry, 'utf8');
  assert.match(winScript, /copy \/b/i);
  assert.match(winScript, /certutil -hashfile/i);
  assert.match(winScript, /if exist.*goto/i);
  assert.match(winScript, new RegExp(expected, 'i'));
  assert.match(winScript, /\.part00/);
  assert.match(winScript, /\.part01/);
  console.log('分卷、还原、缺卷、损坏、重复和同名文件保护通过');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
