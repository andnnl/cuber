# Android 蓝牙扫描弹窗与诊断日志实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复 Android App 点击“连接魔方”没有可见反馈的问题，让用户能扫描、选择并连接魔方，同时让扫描与 GATT 阶段可通过页面和 Logcat 定位。

**架构：** 复用 BLE Cross 已存在的扫描状态与 `pickDevice()`，在 Vue 模板中补齐设备选择对话框。`NativeBridgeTransport` 增加非连接阶段错误监听，页面将原生错误显示在弹窗；Java `BleBridge` 在权限、扫描、连接和服务发现边界输出结构化日志。

**技术栈：** TypeScript 4、Vue 2、Vuetify、Java 17、Android BLE/GATT、Node.js 静态回归测试。

---

## 文件结构

- 修改 `scripts/test-android-app.js`：验证 APK 页面确实包含扫描对话框、设备列表及取消/重试入口，并验证 Java 关键日志存在。
- 修改 `scripts/test-ble.js`：验证原生传输层能把非连接阶段错误送达扫描 UI 监听器。
- 修改 `src/ble/transport/native.ts`：增加扫描错误监听，并分发 `error`、`bluetoothOn` 事件。
- 修改 `src/vue/BleCrossTrainer/index.ts`：注册错误监听，增加重新扫描与关闭扫描方法。
- 修改 `src/vue/BleCrossTrainer/index.html`：增加 Vuetify 扫描弹窗和设备列表。
- 修改 `android/app/src/main/java/com/cuber/trainer/BleBridge.java`：增加权限、扫描、设备、GATT 和服务发现日志。
- 生成 `android/app/src/main/assets/www/*` 和新版 APK。

### 任务 1：建立扫描界面缺失回归测试

**文件：**
- 修改：`scripts/test-android-app.js`

- [ ] **步骤 1：增加模板和日志断言**

```js
const bleTemplate = fs.readFileSync("src/vue/BleCrossTrainer/index.html", "utf8");
const bleBridge = fs.readFileSync(
  "android/app/src/main/java/com/cuber/trainer/BleBridge.java",
  "utf8"
);

assert.match(bleTemplate, /v-model="scanDialog"/);
assert.match(bleTemplate, /v-for="device in scanDevices"/);
assert.match(bleTemplate, /pickDevice\(device\.address\)/);
assert.match(bleTemplate, /restartScan/);
assert.match(bleTemplate, /closeScanDialog/);
assert.match(bleBridge, /Log\.i\(TAG, "scan requested"\)/);
assert.match(bleBridge, /Log\.i\(TAG, "scan started"\)/);
assert.match(bleBridge, /Log\.i\(TAG, "connect requested:/);
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npm run test:android`

预期：FAIL，首先报告模板缺少 `v-model="scanDialog"`。

- [ ] **步骤 3：提交失败测试**

```bash
git add scripts/test-android-app.js
git commit -m "test(Android): 覆盖蓝牙扫描弹窗与日志"
```

### 任务 2：实现原生扫描错误通道

**文件：**
- 修改：`scripts/test-ble.js`
- 修改：`src/ble/transport/native.ts`

- [ ] **步骤 1：增加失败的传输层测试**

在 Node 测试中创建假的 `window.__bleNative`，构造 `NativeBridgeTransport`，注册 `onError()`，通过 `window.__ble.dispatch("error", ...)` 发送扫描错误，并断言收到错误文本。

```js
await test("Native transport 将非连接阶段原生错误送达扫描 UI", () => {
  global.window = {
    __bleNative: { scan() {}, stopScan() {}, connect() {}, disconnect() {}, write() {} },
    setTimeout,
    clearTimeout,
  };
  const { NativeBridgeTransport } = req("transport/native.js");
  const transport = new NativeBridgeTransport();
  let got = "";
  transport.onError((message) => (got = message));
  global.window.__ble.dispatch("error", JSON.stringify({ message: "权限被拒绝" }));
  assert.strictEqual(got, "权限被拒绝");
  delete global.window;
});
```

- [ ] **步骤 2：运行 BLE 测试确认失败**

运行：`npm run test:ble`

预期：FAIL，`transport.onError is not a function`。

- [ ] **步骤 3：实现最小错误监听**

在 `NativeBridgeTransport` 中加入：

```ts
private errorCbs: ((message: string) => void)[] = [];

onError(cb: (message: string) => void): void {
  this.errorCbs.push(cb);
}

private emitError(message: string): void {
  for (const cb of this.errorCbs) {
    cb(message);
  }
}
```

`error` 事件在没有 `connectReject` 时调用 `emitError(message)`；`bluetoothOn` 事件调用 `emitError("蓝牙已开启，请重新扫描")`。

- [ ] **步骤 4：运行 BLE 测试确认通过**

运行：`npm run test:ble`

预期：39 个测试通过，0 失败。

- [ ] **步骤 5：提交传输层改动**

```bash
git add scripts/test-ble.js src/ble/transport/native.ts
git commit -m "fix(蓝牙): 向扫描界面传递原生错误"
```

### 任务 3：实现扫描设备弹窗

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:609-635`
- 修改：`src/vue/BleCrossTrainer/index.html`

- [ ] **步骤 1：增加扫描生命周期方法**

```ts
restartScan(): void {
  this.scanDevices = [];
  this.scanStatus = "扫描中, 请确保魔方已开机...";
  getNativeTransport().startScan(15000);
}

closeScanDialog(): void {
  getNativeTransport().stopScan();
  this.scanDialog = false;
}
```

`openScanDialog()` 首次注册：

```ts
transport.onError((message) => {
  if (this.scanDialog) {
    this.scanStatus = message;
  }
});
```

- [ ] **步骤 2：增加 Vuetify 对话框**

在根 `<v-app>` 内增加：

```html
<v-dialog v-model="scanDialog" max-width="420" persistent>
  <v-card>
    <v-card-title>扫描蓝牙魔方</v-card-title>
    <v-card-text>
      <div>{{ scanStatus }}</div>
      <v-progress-linear v-if="scanDevices.length === 0 && scanStatus.indexOf('扫描中') === 0" indeterminate />
      <v-list v-if="scanDevices.length > 0">
        <v-list-item v-for="device in scanDevices" :key="device.address" @click="pickDevice(device.address)">
          <v-list-item-content>
            <v-list-item-title>{{ device.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ device.address }}</v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn text @click="restartScan">重新扫描</v-btn>
      <v-btn text @click="closeScanDialog">取消</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

- [ ] **步骤 3：运行 Android 静态测试**

运行：`npm run test:android`

预期：模板断言通过，Java 日志断言仍因日志尚未实现而失败。

- [ ] **步骤 4：提交扫描弹窗**

```bash
git add src/vue/BleCrossTrainer/index.ts src/vue/BleCrossTrainer/index.html
git commit -m "fix(蓝牙): 显示 Android 设备扫描弹窗"
```

### 任务 4：增加 Android 原生 BLE 诊断日志

**文件：**
- 修改：`android/app/src/main/java/com/cuber/trainer/BleBridge.java`

- [ ] **步骤 1：记录权限与扫描边界**

增加 `Log.i/w/e`：`scan requested`、缺失权限列表、权限结果、蓝牙关闭、`scan started`、`scan stopped` 和发现设备。

- [ ] **步骤 2：记录连接边界**

增加 `connect requested: <address>`、GATT 状态、服务发现状态、服务数量、通知订阅完成、错误与断开日志。

- [ ] **步骤 3：运行 Android 静态测试和 Java 编译**

运行：

```bash
npm run test:android
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 PATH=/usr/lib/jvm/java-21-openjdk-amd64/bin:$PATH android/gradlew -p android :app:compileDebugJavaWithJavac
```

预期：配置测试通过，Java 编译 `BUILD SUCCESSFUL`。

- [ ] **步骤 4：提交原生日志**

```bash
git add android/app/src/main/java/com/cuber/trainer/BleBridge.java
git commit -m "feat(Android): 增加蓝牙连接诊断日志"
```

### 任务 5：构建并验证新版 APK

**文件：**
- 生成：`android/app/src/main/assets/www/*`
- 生成：`android/app/build/outputs/apk/debug/app-debug.apk`
- 生成：`android/app/build/outputs/apk/release/app-release.apk`

- [ ] **步骤 1：执行完整构建**

运行：`bash android/build-apk.sh`

预期：Android 配置测试通过、BLE 39/39 通过、webpack 成功、Gradle `BUILD SUCCESSFUL`。

- [ ] **步骤 2：同步并提交最新 assets**

```bash
git add -A android/app/src/main/assets/www
git commit -m "build(Android): 同步扫描弹窗前端资源"
```

- [ ] **步骤 3：检查 APK 内容和校验值**

运行：

```bash
/dd/AndoridSdk/build-tools/35.0.0/aapt2 dump badging android/app/build/outputs/apk/debug/app-debug.apk
unzip -p android/app/build/outputs/apk/debug/app-debug.apk classes.dex | strings | grep -m1 "scan requested"
sha256sum android/app/build/outputs/apk/debug/app-debug.apk
```

预期：版本仍为 1.0.5/6，DEX 包含日志文本，并输出新版 APK SHA-256。

- [ ] **步骤 4：最终检查**

运行：

```bash
git diff --check -- android src scripts package.json docs/superpowers
git status --short
```

预期：本次改动无空白错误；用户原有 README、`.superpowers/`、`.trae/`、`dist/cube_cross_table.bin` 保持不变。
