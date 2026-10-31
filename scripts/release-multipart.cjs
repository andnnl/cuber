#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const PART_SIZE = 90 * 1024 * 1024;
const [source, directory] = process.argv.slice(2);
if (!source || !directory || !/^Cuber-[a-zA-Z0-9._-]+\.(exe|AppImage)$/.test(path.basename(source))) {
  console.error('用法：node scripts/release-multipart.cjs <Cuber-*.exe|AppImage> <输出目录>');
  process.exit(2);
}
const target = path.resolve(directory);
fs.mkdirSync(target, { recursive: true });
const input = fs.openSync(source, 'r');
const length = fs.fstatSync(input).size;
if (!fs.fstatSync(input).isFile() || !Number.isSafeInteger(length) || length === 0) throw Error('安装包必须是非空普通文件');
const wholeHash = createHash('sha256');
const buffer = Buffer.allocUnsafe(1024 * 1024);
const parts = [];
let offset = 0;
try {
  while (offset < length) {
    const name = `${path.basename(source)}.part${String(parts.length).padStart(2, '0')}`;
    const partPath = path.join(target, name);
    const temporary = `${partPath}.partial-${process.pid}`;
    const expectedSize = Math.min(PART_SIZE, length - offset);
    const partHash = createHash('sha256');
    const fd = fs.openSync(temporary, 'wx');
    let copied = 0;
    try {
      while (copied < expectedSize) {
        const count = fs.readSync(input, buffer, 0, Math.min(buffer.length, expectedSize - copied), offset + copied);
        if (!count) throw Error(`读取安装包提前结束：${name}`);
        let written = 0;
        while (written < count) written += fs.writeSync(fd, buffer, written, count - written);
        wholeHash.update(buffer.subarray(0, count));
        partHash.update(buffer.subarray(0, count));
        copied += count;
      }
      fs.closeSync(fd);
      const digest = partHash.digest('hex');
      if (fs.existsSync(partPath)) {
        if (fs.statSync(partPath).size !== expectedSize || hashFile(partPath) !== digest) throw Error(`已有同名分卷内容不同：${name}`);
      } else fs.linkSync(temporary, partPath);
      parts.push({ name, size: expectedSize, sha256: digest });
    } finally {
      try { fs.closeSync(fd); } catch {}
      fs.unlinkSync(temporary);
    }
    offset += expectedSize;
  }
} finally { fs.closeSync(input); }
const digest = wholeHash.digest('hex');
const base = path.basename(source).replace(/\.(exe|AppImage)$/, '');
const windows = source.endsWith('.exe');
const entry = `${base}-unpack${windows ? '.bat' : '.sh'}`;
const result = `${base}-unpack-result.txt`;
const manifest = `${digest}  ${path.basename(source)}\n${parts.map(p => `${p.sha256}  ${p.name}`).join('\n')}\n`;
const script = windows ? windowsScript(path.basename(source), digest, parts) : linuxScript(path.basename(source), digest, parts, result);
publishContent(script, path.join(target, entry), !windows);
publishContent(manifest, path.join(target, `${base}-SHA256.txt`));
console.log(JSON.stringify({ source: path.basename(source), length, sha256: digest, parts, entry }));

function publishContent(content, to, executable = false) {
  if (fs.existsSync(to)) {
    if (fs.readFileSync(to, 'utf8') !== content) throw Error(`已有同名附件内容不同：${path.basename(to)}`);
  } else {
    fs.writeFileSync(to, content, { flag: 'wx', mode: executable ? 0o755 : 0o644 });
  }
}

function linuxScript(name, fullHash, chunks, resultName) {
  const partChecks = chunks.map(p => `printf '%s  %s\\n' '${p.sha256}' '${p.name}' | sha256sum --check --status - || fail 'Missing or damaged volume: ${p.name}'`).join('\n');
  const inputs = chunks.map(p => `'${p.name}'`).join(' ');
  return `#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")" || exit 1
name='${name}'
result='${resultName}'
hash='${fullHash}'
notify() {
  printf '%s\\n' "$1" >> "$result"
  printf '%s\\n' "$1"
  if [ "\${CUBER_RELEASE_TEST_SILENT:-}" != 1 ] && [ -n "\${DISPLAY:-}\${WAYLAND_DISPLAY:-}" ]; then
    if command -v zenity >/dev/null 2>&1; then zenity --info --text="$1" || :; elif command -v kdialog >/dev/null 2>&1; then kdialog --msgbox "$1" || :; fi
  fi
}
fail() { notify "Failed: $1"; exit 1; }
verify() { printf '%s  %s\\n' "$hash" "$1" | sha256sum --check --status -; }
if [ -e "$name" ] || [ -L "$name" ]; then
  verify "$name" && { notify "Already unpacked: $name"; exit 0; }
  fail "Existing file differs; not overwritten: $name"
fi
${partChecks}
tmp=$(mktemp "./$name.partial.XXXXXXXX") || fail 'Cannot create temporary file'
trap 'rm -f -- "$tmp"' EXIT HUP INT TERM
cat ${inputs} > "$tmp" || fail 'Cannot join volumes'
verify "$tmp" || fail 'Full installer SHA-256 mismatch'
chmod +x -- "$tmp" || fail 'Cannot set executable permission'
ln -- "$tmp" "$name" || fail 'Cannot publish installer without overwriting an existing file'
notify "Unpacked and verified: $name"
`;
}

function windowsScript(name, fullHash, chunks) {
  const checks = chunks.map(p => `if not exist "${p.name}" goto missing\nfor %%F in ("${p.name}") do if not "%%~zF"=="${p.size}" goto damaged\ncall :verify "${p.name}" "${p.sha256}" || goto damaged`).join('\r\n');
  const inputs = chunks.map(p => `"${p.name}"`).join('+');
  return `@echo off\r
setlocal EnableExtensions DisableDelayedExpansion\r
cd /d "%~dp0" || goto failed\r
if exist "${name}" goto existing\r
${checks}\r
set "temporary=${name}.partial.%RANDOM%.%RANDOM%"\r
if exist "%temporary%" goto failed\r
copy /b ${inputs} "%temporary%" >nul || goto cleanup\r
call :verify "%temporary%" "${fullHash}" || goto cleanup\r
if exist "${name}" goto cleanup\r
ren "%temporary%" "${name}" || goto cleanup\r
echo Unpacked and verified: ${name}\r
goto success\r
:existing\r
call :verify "${name}" "${fullHash}" || goto conflict\r
echo Already unpacked and verified: ${name}\r
goto success\r
:missing\r
echo Missing volume. Put all volumes and this script in one directory.\r
goto failed\r
:damaged\r
echo Damaged volume or SHA-256 mismatch. No installer was created.\r
goto failed\r
:conflict\r
echo Existing installer differs. It was not overwritten.\r
goto failed\r
:cleanup\r
if exist "%temporary%" del /q "%temporary%"\r
echo Join failed or installer SHA-256 mismatch.\r
:failed\r
echo Unpack failed.\r
pause\r
exit /b 1\r
:success\r
pause\r
exit /b 0\r
:verify\r
certutil -hashfile "%~1" SHA256 2>nul | findstr /i /x /c:"%~2" >nul\r
exit /b %errorlevel%\r
`;
}

function hashFile(file) {
  const fd = fs.openSync(file, 'r');
  const hash = createHash('sha256');
  try {
    let n;
    while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
