# Android 蓝牙魔方 App 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [x]`）语法来跟踪进度。

**目标：** 生成安装后直接进入蓝牙十字训练、支持现有 GAN 蓝牙协议且 release 关闭 WebView 调试的 Android APK。

**架构：** 保持当前 Java WebView 壳和 `window.__bleNative` 原生 BLE 桥不变，只调整 Android 启动配置、构建版本与发布调试策略。构建脚本负责用 JDK 17+ 生成最新前端资源、搜索表和 debug/release APK，并通过静态配置测试和实际构建验证交付物。

**技术栈：** Java 17、Android SDK 36、Gradle/AGP、TypeScript、Vue 2、webpack 5、Node.js。

---

## 文件结构

- 创建 `scripts/test-android-app.js`：静态验证 Android 默认入口、版本、WebView 调试策略和 BLE 权限。
- 修改 `package.json`：增加 Android 配置测试命令。
- 修改 `android/app/src/main/java/com/cuber/trainer/MainActivity.java`：默认进入 `blecross`，release 关闭 WebView 调试。
- 修改 `android/app/build.gradle.kts`：升级 Android App 版本。
- 修改 `android/build-apk.sh`：在默认 Java 不满足要求时选择本机 JDK 21，并在构建前运行验证。
- 修改 `android/README.md`：同步默认页面、版本、签名和构建说明。

### 任务 1：建立 Android 配置回归测试

**文件：**
- 创建：`scripts/test-android-app.js`
- 修改：`package.json`

- [x] **步骤 1：编写失败的配置测试**

```js
const assert = require("assert");
const fs = require("fs");

const main = fs.readFileSync("android/app/src/main/java/com/cuber/trainer/MainActivity.java", "utf8");
const gradle = fs.readFileSync("android/app/build.gradle.kts", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");

assert.match(main, /index\.html\?mode=blecross/);
assert.match(main, /setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/);
assert.match(gradle, /versionCode\s*=\s*6/);
assert.match(gradle, /versionName\s*=\s*"1\.0\.5"/);
for (const permission of ["BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "ACCESS_FINE_LOCATION"]) {
  assert.match(manifest, new RegExp(`android\\.permission\\.${permission}`));
}
console.log("Android app configuration tests passed");
```

在 `package.json` 的 scripts 中增加：

```json
"test:android": "node scripts/test-android-app.js"
```

- [x] **步骤 2：运行测试并确认因旧配置失败**

运行：`npm run test:android`

预期：FAIL，首先报告找不到 `index.html?mode=blecross`。

- [x] **步骤 3：提交测试**

```bash
git add package.json scripts/test-android-app.js
git commit -m "test(Android): 添加应用配置回归检查"
```

### 任务 2：更新 Android 启动和发布配置

**文件：**
- 修改：`android/app/src/main/java/com/cuber/trainer/MainActivity.java:27-29,72-73`
- 修改：`android/app/build.gradle.kts:10-16`

- [x] **步骤 1：修改默认入口和调试开关**

将启动 URL 改为：

```java
private static final String START_URL =
        "https://appassets.androidplatform.net/assets/www/index.html?mode=blecross";
```

将 WebView 调试改为：

```java
WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
```

- [x] **步骤 2：升级应用版本**

```kotlin
versionCode = 6
versionName = "1.0.5"
```

- [x] **步骤 3：运行 Android 配置测试**

运行：`npm run test:android`

预期：PASS，输出 `Android app configuration tests passed`。

- [x] **步骤 4：提交 Android 配置**

```bash
git add android/app/src/main/java/com/cuber/trainer/MainActivity.java android/app/build.gradle.kts
git commit -m "feat(Android): 默认进入蓝牙十字训练"
```

### 任务 3：固定可用的 Java 构建环境

**文件：**
- 修改：`android/build-apk.sh`

- [x] **步骤 1：扩展配置测试以检查 JDK 选择逻辑**

在 `scripts/test-android-app.js` 读取 `android/build-apk.sh` 并增加：

```js
const buildScript = fs.readFileSync("android/build-apk.sh", "utf8");
assert.match(buildScript, /java-21-openjdk-amd64/);
assert.match(buildScript, /JAVA_HOME/);
```

- [x] **步骤 2：运行测试并确认缺少 JDK 选择逻辑**

运行：`npm run test:android`

预期：FAIL，报告构建脚本不包含 `java-21-openjdk-amd64`。

- [x] **步骤 3：在构建脚本中选择 JDK 21**

在 Gradle 构建前增加：

```bash
if [ -x /usr/lib/jvm/java-21-openjdk-amd64/bin/java ]; then
  export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
  export PATH="$JAVA_HOME/bin:$PATH"
fi
java -version
```

并在 webpack 前运行：

```bash
npm run test:android
npm run test:ble
```

- [x] **步骤 4：运行配置测试**

运行：`npm run test:android`

预期：PASS。

- [x] **步骤 5：提交构建脚本**

```bash
git add scripts/test-android-app.js android/build-apk.sh
git commit -m "build(Android): 自动选择 JDK 21"
```

### 任务 4：同步 Android 文档

**文件：**
- 修改：`android/README.md`

- [x] **步骤 1：更新文档内容**

明确记录：

```text
- App 默认启动蓝牙十字训练（mode=blecross）。
- 当前版本为 1.0.5（versionCode 6）。
- release APK 当前使用 debug 签名，仅用于个人安装测试。
- debug 允许 WebView 远程调试，release 关闭。
- 构建脚本会优先使用 /usr/lib/jvm/java-21-openjdk-amd64。
```

- [x] **步骤 2：提交文档**

```bash
git add android/README.md
git commit -m "docs(Android): 更新蓝牙应用打包说明"
```

### 任务 5：构建并检查 APK

**文件：**
- 生成：`android/app/src/main/assets/www/*`
- 生成：`android/app/build/outputs/apk/debug/app-debug.apk`
- 生成：`android/app/build/outputs/apk/release/app-release.apk`

- [x] **步骤 1：执行完整 Android 构建**

运行：`bash android/build-apk.sh`

预期：BLE 测试、webpack、搜索表生成以及 `assembleDebug assembleRelease` 全部成功。

- [x] **步骤 2：检查 APK 元数据与资源**

运行：

```bash
/dd/AndoridSdk/build-tools/35.0.0/aapt2 dump badging android/app/build/outputs/apk/release/app-release.apk
unzip -l android/app/build/outputs/apk/release/app-release.apk | grep -E 'assets/www/(index\.html|cube_cross_solve_bg\.wasm|cube_cross_table\.bin)'
```

预期：包名为 `com.cuber.trainer`，版本为 `1.0.5`/`6`，三个关键资源均存在。

- [x] **步骤 3：检查工作区和最终差异**

运行：

```bash
git status --short
git diff --check
git log -5 --oneline
```

预期：不存在空白错误；用户原有 `README.md`、`.superpowers/`、`.trae/` 和 `dist/cube_cross_table.bin` 不被误提交或删除。

- [x] **步骤 4：报告真机验证边界**

说明 APK 已完成静态和构建验证，但真实扫描、连接、转动同步及断线重连仍需 Android 手机和 GAN 魔方进行最终验收。
