# Android APK 打包教程

本文档说明如何将魔方训练器（CrossF2LTrainer）打包为 Android APP。

## 架构说明

APP 采用**原生 WebView 壳**方案（纯 Java，零 Kotlin/Compose 依赖）：

- [MainActivity.java](app/src/main/java/com/cuber/trainer/MainActivity.java) 通过 `WebViewAssetLoader`（androidx.webkit）把 assets 映射为 `https://appassets.androidplatform.net` 同源地址
- **为什么不用 `file://` 直接加载**：Cross 求解器是 WASM + ES Module（`import.meta.url` + `fetch` 加载），`file://` 协议下会因跨域限制加载失败；https 同源语义可根治
- **搜索表随包分发**：`cube_cross_table.bin`（约 2.5MB 的十字求解剪枝表）在构建时由 [scripts/gen-table.mjs](../scripts/gen-table.mjs) 生成并打入 assets，APP 启动秒加载，无需现场重算

## 环境要求

| 组件 | 要求 | 说明 |
|------|------|------|
| Node.js | v22+（需 nvm 或系统安装） | webpack 构建 |
| Java JDK | 17+ | 本机为 OpenJDK 21 |
| Android SDK | platforms 36 + build-tools 35.0.0 | 本机位于 `/dd/AndoridSdk` |
| gradle | 8.13（wrapper 自动下载） | 走腾讯镜像，国内直连 |
| AGP | 8.11.1 | 走阿里云 maven 镜像 |

SDK 路径配置在 [local.properties](local.properties)（`sdk.dir=/dd/AndoridSdk`），按实际位置修改。

> **注意**：若 SDK 是从 Windows 拷贝的（build-tools 目录里全是 `.exe`），需先用 cmdline-tools 重装 Linux 版：
>
> ```bash
> ~/.apk-builder/android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/dd/AndoridSdk --uninstall "build-tools;35.0.0"
> ~/.apk-builder/android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/dd/AndoridSdk "build-tools;35.0.0"
> ```

## 一键打包

```bash
bash android/build-apk.sh
```

脚本自动完成 4 步：

1. **webpack 生产构建**：`npx webpack --mode=production` → `dist/`
2. **生成搜索表 bin**：`node scripts/gen-table.mjs dist` → `dist/cube_cross_table.bin`（Node 直接调用 wasm 生成，幂等可跳过已有表）
3. **同步 assets**：`dist/*` → `android/app/src/main/assets/www/`
4. **gradle 打包**：`assembleDebug` + `assembleRelease`

产物：

| 文件 | 说明 |
|------|------|
| `android/app/build/outputs/apk/release/app-release.apk` | release 版（debug 签名，可直接安装） |
| `android/app/build/outputs/apk/debug/app-debug.apk` | debug 版 |

## 修改版本号

编辑 [app/build.gradle.kts](app/build.gradle.kts)：

```kotlin
defaultConfig {
    versionCode = 1      // 每次发版 +1
    versionName = "1.0.0"
}
```

## 更换图标

替换 `dist/icon.png`（建议 512×512 PNG），再重新生成各密度图标：

```bash
python3 - <<'EOF'
from PIL import Image
import os
src = Image.open("dist/icon.png").convert("RGBA")
res = "android/app/src/main/res"
densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for d, size in densities.items():
    folder = f"{res}/mipmap-{d}"
    os.makedirs(folder, exist_ok=True)
    src.resize((size, size), Image.LANCZOS).save(f"{folder}/ic_launcher.png")
EOF
```

## 常见问题

- **求解一直「计算中」**：检查 APK 内是否含 `assets/www/cube_cross_table.bin`（`unzip -l xxx.apk | grep bin`），缺失说明跳过了 build-apk.sh 的第 2 步
- **白屏**：WebView 版本过旧不支持 ES Module，需 Android System WebView 90+（Play 商店或系统更新）
- **验证 APK 内容**：`/dd/AndoridSdk/build-tools/35.0.0/aapt2 dump badging app-release.apk`
