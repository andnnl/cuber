#!/usr/bin/env bash
# 用法：bash scripts/package-all.sh [all|windows|linux|android] [--dry-run]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo '用法：bash scripts/package-all.sh [all|windows|linux|android] [--dry-run]'
  echo '产物：desktop-release/Cuber-<version>-{linux,win}-* 及 Cuber-<version>-android-{debug,release}.apk'
}

platform=all
dry_run=false
platform_seen=false
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage; exit 0 ;;
    --dry-run) dry_run=true ;;
    all|windows|linux|android)
      if [ "$platform_seen" = true ]; then usage >&2; exit 2; fi
      platform="$arg"
      platform_seen=true ;;
    *) usage >&2; echo "未知选项：$arg" >&2; exit 2 ;;
  esac
done

# dry-run 不读取工具链，也不写文件；可用来预览平台选择与执行顺序。
if [ "$dry_run" = true ]; then
  version="$(sed -n 's/^[[:space:]]*"version": "\([^"]*\)".*/\1/p' package.json | head -n 1)"
else
  # PATH 上可能有名为 node 的 Bun shim；保证实际使用的是 Node.js。
  if ! command -v node >/dev/null || [[ "$(node --version)" != v* ]]; then
    shopt -s nullglob
    node_candidates=("${NVM_DIR:-$HOME/.nvm}"/versions/node/v*/bin/node)
    shopt -u nullglob
    if [ "${#node_candidates[@]}" -eq 0 ]; then
      echo '未找到 Node.js，请将真实 Node.js 加入 PATH（不能使用 Bun 的 node shim）。' >&2
      exit 1
    fi
    node_bin="$(printf '%s\n' "${node_candidates[@]}" | sort -V | tail -n 1)"
    export PATH="$(dirname "$node_bin"):$PATH"
  fi
  command -v npm >/dev/null || { echo '未找到 npm。' >&2; exit 1; }
  version="$(node -p "require('./package.json').version")"
fi

run_step() {
  local label="$1"
  shift
  echo "==> $label"
  if [ "$dry_run" = false ]; then "$@"; fi
}

export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--openssl-legacy-provider"
run_step web:build npm run build
run_step web:table node scripts/gen-table.mjs dist

if [ "$platform" = all ] || [ "$platform" = linux ]; then
  run_step desktop:linux npm run test:linux-scanner
  if [ "$dry_run" = false ]; then
    node node_modules/electron-builder/cli.js --linux AppImage
    shopt -s nullglob
    linux_artifacts=(desktop-release/Cuber-"$version"-linux-*.AppImage)
    shopt -u nullglob
    [ "${#linux_artifacts[@]}" -gt 0 ] && [ -s "${linux_artifacts[0]}" ] || { echo 'Linux AppImage 缺失。' >&2; exit 1; }
  fi
fi

if [ "$platform" = all ] || [ "$platform" = windows ]; then
  run_step desktop:windows node scripts/require-windows-scanner.cjs
  if [ "$dry_run" = false ]; then
    node node_modules/electron-builder/cli.js --win nsis
    shopt -s nullglob
    windows_artifacts=(desktop-release/Cuber-"$version"-win-*.exe)
    shopt -u nullglob
    [ "${#windows_artifacts[@]}" -gt 0 ] && [ -s "${windows_artifacts[0]}" ] || { echo 'Windows 安装包缺失。' >&2; exit 1; }
  fi
fi

if [ "$platform" = all ] || [ "$platform" = android ]; then
  run_step android:build bash android/build-apk.sh --reuse-dist
  if [ "$dry_run" = false ]; then
    mkdir -p desktop-release
    for variant in debug release; do
      source_apk="android/app/build/outputs/apk/$variant/app-$variant.apk"
      target_apk="desktop-release/Cuber-$version-android-$variant.apk"
      [ -s "$source_apk" ] || { echo "APK 缺失或为空：$source_apk" >&2; exit 1; }
      cp "$source_apk" "$target_apk"
      [ -s "$target_apk" ] || { echo "APK 复制失败：$target_apk" >&2; exit 1; }
      echo "==> android:$variant $target_apk"
    done
  else
    echo "==> android:release desktop-release/Cuber-$version-android-release.apk"
    echo "==> android:debug desktop-release/Cuber-$version-android-debug.apk"
  fi
fi

echo '==> 完成；交付目录：desktop-release/'
