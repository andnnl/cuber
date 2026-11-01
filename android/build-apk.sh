#!/usr/bin/env bash
# 一键构建 Android APK:
# 1. webpack 生产构建 -> 2. 拷贝 dist 到 assets -> 3. gradle 打包 debug + release
# 产物: android/app/build/outputs/apk/{debug,release}/*.apk
set -e
cd "$(dirname "$0")/.."

if [ "${1:-}" != "" ] && [ "$1" != "--reuse-dist" ]; then
  echo '用法：bash android/build-apk.sh [--reuse-dist]' >&2
  exit 2
fi

if [ -x /usr/lib/jvm/java-21-openjdk-amd64/bin/java ]; then
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
  export PATH="$JAVA_HOME/bin:$PATH"
fi

echo "==> [0/5] 环境与回归检查"
java -version

if [ "${1:-}" != "--reuse-dist" ]; then
  export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
fi
npm run test:android
npm run test:ble

if [ "${1:-}" = "--reuse-dist" ]; then
  echo '==> [1-2/5] 复用统一入口已构建的 dist'
  test -s dist/index.html && test -s dist/cube_cross_table.bin
else
  echo "==> [1/5] webpack 生产构建"
  export NODE_OPTIONS=--openssl-legacy-provider
  npx webpack --color --mode=production --progress

  echo "==> [2/5] 生成 Cross 求解搜索表 bin (打进包内, 启动免重算)"
  node scripts/gen-table.mjs dist
fi

echo "==> [3/5] 同步 dist -> android assets/www"
ASSETS=android/app/src/main/assets/www
rm -rf "$ASSETS"
mkdir -p "$ASSETS"
cp -r dist/* "$ASSETS/"

echo "==> [4/5] gradle 打包"
cd android
./gradlew assembleDebug assembleRelease

echo "==> [5/5] APK 产物"
echo ""
ls -lh app/build/outputs/apk/debug/app-debug.apk app/build/outputs/apk/release/app-release.apk
