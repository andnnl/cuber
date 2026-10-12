# BLECross 初始化 z2 与首次打乱配色同步实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 BLECross 在恢复持久化 z2 状态后，第一次点击“新打乱”就按当前底色生成十字，并正确显示对应的相关棱块。

**架构：** 先通过 Playwright 页面回归测试锁定 z2 开/关刷新后的首次打乱行为。实现中增加单一的“标准场景重建后恢复视角”方法：在标准态或打乱态建立完成后，按当前 `z2On` 恰好应用一次 z2，并在最终姿态上清除、重建相关块缓存；初始化和手动开轮共同使用该方法。

**技术栈：** TypeScript 4、Vue 2、Three.js、Playwright CLI、webpack 5、Android Gradle。

---

## 文件结构

- 修改 `scripts/verify-blecross-recompute.js`：增加持久化 z2 开/关后首次打乱的浏览器回归验证。
- 修改 `src/vue/BleCrossTrainer/index.ts`：统一初始化设置顺序与场景重建后的 z2/可视化恢复。
- 生成 `dist/index.*.js`、`dist/index.html`：生产前端构建产物。
- 生成 `android/app/src/main/assets/www/index.*.js`、`android/app/src/main/assets/www/index.html`：Android 内置前端资源。

## 任务 1：建立首次打乱底色回归测试

**文件：**
- 修改：`scripts/verify-blecross-recompute.js:1-15`

- [x] **步骤 1：在页面验证开头增加 z2 持久化场景测试**

在首次进入 BLECross 并取得 `window.__bleCross` 后，依次验证保存开启和保存关闭：

```js
  const verifyInitialZ2Scramble = async (enabled, expectedSignatures) => {
    await page.evaluate(value => {
      localStorage.setItem("bleZ2On", value ? "1" : "0");
      localStorage.setItem("bleVisHide", "1");
      localStorage.setItem("bleDifficulty", "random");
    }, enabled);
    await page.reload();
    await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
    return page.evaluate(async expected => {
      const vm = window.__bleCross;
      await vm.newScramble();
      vm.applyVisibility();
      return {
        z2On: vm.z2On,
        saved: localStorage.getItem("bleZ2On"),
        signatures: Array.from(vm.visibilityNeededSignatures || []).sort(),
        expected,
      };
    }, expectedSignatures);
  };

  const initialWhiteCross = await verifyInitialZ2Scramble(true, ["BU", "FU", "LU", "RU"]);
  const initialYellowCross = await verifyInitialZ2Scramble(false, ["BD", "DF", "DL", "DR"]);
```

对两个结果分别断言：

```js
  if (
    !initialWhiteCross.z2On ||
    initialWhiteCross.saved !== "1" ||
    JSON.stringify(initialWhiteCross.signatures) !== JSON.stringify(initialWhiteCross.expected)
  ) {
    throw new Error(`保存 z2 开启后的首次打乱底色异常: ${JSON.stringify(initialWhiteCross)}`);
  }
  if (
    initialYellowCross.z2On ||
    initialYellowCross.saved !== "0" ||
    JSON.stringify(initialYellowCross.signatures) !== JSON.stringify(initialYellowCross.expected)
  ) {
    throw new Error(`保存 z2 关闭后的首次打乱底色异常: ${JSON.stringify(initialYellowCross)}`);
  }
```

测试结束后移除本步骤写入的 `bleZ2On`、`bleVisHide` 和 `bleDifficulty`，再刷新一次，避免影响后续既有用例。

- [x] **步骤 2：启动开发服务器并运行测试，确认旧实现失败**

终端一运行：

```bash
npm run watch
```

终端二运行：

```bash
npm run verify:blecross
```

预期：FAIL，错误包含 `保存 z2 开启后的首次打乱底色异常`，并显示白底状态得到的相关块签名不是 `BU/FU/LU/RU`。

- [x] **步骤 3：提交失败测试**

```bash
git add scripts/verify-blecross-recompute.js
git commit -m "test(蓝牙训练): 覆盖初始化 z2 后首次打乱配色"
```

## 任务 2：统一初始化设置与场景视角恢复

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:413-491`
- 修改：`src/vue/BleCrossTrainer/index.ts:851-856`
- 修改：`src/vue/BleCrossTrainer/index.ts:2080-2165`

- [x] **步骤 1：增加场景重建后的统一恢复方法**

在 `applyZ2Flip()` 后增加：

```ts
  /** 标准态/打乱态重建后，按当前设置恢复一次视角，并在最终姿态重建相关块缓存。 */
  private restoreViewAfterSceneReset(): void {
    this.z2Marks = this.z2On ? [0] : [];
    if (this.z2On) {
      this.applyZ2Flip(true);
    }
    this.invalidateVisibilityTargets();
    this.applyVisibility();
  }
```

该方法不切换 `z2On`、不写 `localStorage`、不请求解法，只负责把重建后的标准场景恢复到当前已确定的视角状态。

- [x] **步骤 2：调整 mounted 初始化顺序**

把以下持久化字段读取移动到 `$nextTick()` 之前，并保持既有默认值：

```ts
    this.compactMode = window.localStorage.getItem("bleCompactMode") === "1";
    this.autoNext = window.localStorage.getItem("bleAutoNext") !== "0";
    this.retryNonOptimal = window.localStorage.getItem("bleRetryNonOptimal") === "1";
    this.showBest = window.localStorage.getItem("bleShowBest") !== "0";
    this.visGhost = window.localStorage.getItem("bleVisGhost") === "1";
    this.visHide = window.localStorage.getItem("bleVisHide") === "1";
    this.difficulty = parseCrossDifficulty(window.localStorage.getItem("bleDifficulty"));
    this.z2On = window.localStorage.getItem("bleZ2On") === "1";
```

在 `$nextTick()` 完成配色刷新和旧黄顶存档修正后，从标准态重建初始场景：

```ts
      this.rebasing = true;
      this.syncScene(SOLVED_FACELETS, "init");
      this.baseOps = [];
      this.observedOps = [];
      this.restoreViewAfterSceneReset();
      this.syncObservedOps();
      this.rebasing = false;
```

删除原先单独执行的：

```ts
      if (this.z2On) {
        this.applyZ2Flip(true);
      }
```

并删除 `$nextTick()` 之后重复的持久化字段读取以及直接设置 `z2Marks` 的代码。

- [x] **步骤 3：让手动开轮复用统一恢复方法**

在 `startScramble()` 手动分支中，保留标准态重建与公式应用顺序：

```ts
      this.syncScene(SOLVED_FACELETS);
      cube.twister.setup(formula);
```

把原来的 `z2Marks` 设置与条件翻转替换为：

```ts
      this.restoreViewAfterSceneReset();
```

然后继续执行：

```ts
      this.applyBaseOrientation();
      this.syncObservedOps();
```

这样随机难度、自定义公式和固定步数难度最终都会在打乱态完成后，按同一个 `z2On` 恢复姿态并重建相关块缓存。

- [x] **步骤 4：运行浏览器回归测试确认通过**

保持开发服务器运行，执行：

```bash
npm run verify:blecross
```

预期：PASS；新增白底、黄底首次打乱验证通过，原有收纳模式、难度生成、视角重算、相关块缓存和蓝牙轮次验证继续通过。

- [x] **步骤 5：运行 BLE 单元测试**

```bash
npm run test:ble
```

预期：`39 通过, 0 失败`。

- [x] **步骤 6：提交实现**

```bash
git add src/vue/BleCrossTrainer/index.ts
git commit -m "fix(蓝牙训练): 同步初始化 z2 与首次打乱配色"
```

## 任务 3：构建并验证 Web 与 Android 产物

**文件：**
- 生成：`dist/index.*.js`
- 生成：`dist/index.html`
- 生成：`android/app/src/main/assets/www/index.*.js`
- 生成：`android/app/src/main/assets/www/index.html`
- 生成：`android/app/build/outputs/apk/debug/app-debug.apk`
- 生成：`android/app/build/outputs/apk/release/app-release.apk`

- [x] **步骤 1：执行完整 Android 构建**

```bash
bash android/build-apk.sh
```

预期：Android 配置测试通过、BLE `39 通过, 0 失败`、webpack 编译成功、Gradle `BUILD SUCCESSFUL`。

- [x] **步骤 2：检查生成资源只包含预期入口更新**

```bash
git status --short
git diff --check -- src scripts android/app/src/main/assets/www docs/superpowers
```

确认不暂存用户已有的 `README.md`、`.superpowers/`、`.trae/`、`.codebase-memory/` 和任务开始前已有的 `dist` 改动。Android assets 只应替换入口 JS 哈希和 `index.html` 引用。

- [x] **步骤 3：提交 Android 内置前端资源**

```bash
git add -A android/app/src/main/assets/www
git commit -m "build(Android): 同步初始化 z2 配色修复资源"
```

- [x] **步骤 4：验证 APK 内容**

```bash
/dd/AndoridSdk/build-tools/35.0.0/aapt2 dump badging android/app/build/outputs/apk/debug/app-debug.apk
unzip -l android/app/build/outputs/apk/debug/app-debug.apk | rg 'assets/www/(index\.html|index\..*\.js|cube_cross_table\.bin)'
sha256sum android/app/build/outputs/apk/debug/app-debug.apk android/app/build/outputs/apk/release/app-release.apk
```

预期：包名仍为 `com.cuber.trainer`、版本仍为 `1.0.5/6`，APK 内入口 JS 为本次新构建哈希，并输出两个 APK 的 SHA-256。

- [x] **步骤 5：最终检查**

```bash
git status --short
git diff --check -- src scripts android/app/src/main/assets/www docs/superpowers
git log -5 --oneline
```

预期：本次源代码、测试和 Android assets 已提交；用户已有的无关工作区改动保持原样。
