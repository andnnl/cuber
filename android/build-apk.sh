#!/usr/bin/env bash
# 一键构建 Android APK:
# 1. webpack 生产构建 -> 2. 拷贝 dist 到 assets -> 3. gradle 打包 debug + release
# 产物: android/app/build/outputs/apk/{debug,release}/*.apk
set -e
cd "$(dirname "$0")/.."

if [ -x /usr/lib/jvm/java-21-openjdk-amd64/bin/java ]; then
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
  export PATH="$JAVA_HOME/bin:$PATH"
fi

echo "==> [0/5] 环境与回归检查"
java -version

export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
npm run test:android
npm run test:ble

echo "==> [1/5] webpack 生产构建"
export NODE_OPTIONS=--openssl-legacy-provider
npx webpack --color --mode=production --progress

echo "==> [2/5] 生成 Cross 求解搜索表 bin (打进包内, 启动免重算)"
node scripts/gen-table.mjs dist

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
