# BLE Cross 手机端打乱区域实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。本项目按用户约定直接在当前 `master` 工作区执行，不创建 worktree，不调度子代理。

**目标：** 将 BLE Cross 的打乱输入、完整公式查看和复制交互对齐 `mode=crossf2l`，消除手机端公式被压成竖排的问题。

**架构：** 模板把完整公式从固定按钮行移到独立的自定义输入行和打乱信息弹窗；组件将随机公式与自定义公式汇入一个统一开轮方法，保留现有手动、模拟和蓝牙轮次语义。浏览器验证脚本先建立移动端布局与交互红灯，再驱动最小实现并覆盖复制降级路径。

**技术栈：** TypeScript 4.3、Vue 2 class component、Vuetify 2、动态注入 CSS、Playwright CLI、webpack 5

---

## 文件结构

- 修改 `scripts/verify-blecross-recompute.js`：增加 360 px 移动端布局、自定义公式、弹窗和复制的回归验证。
- 修改 `src/vue/BleCrossTrainer/index.html`：调整打乱操作行，新增输入行与打乱信息弹窗。
- 修改 `src/vue/BleCrossTrainer/index.ts`：增加 UI 状态、公式校验、复制逻辑，并统一随机与自定义开轮入口。
- 修改 `src/vue/BleCrossTrainer/theme.ts`：增加操作行换行、输入框和公式弹窗样式，移除操作行旧公式样式。
- 更新 `dist/index.html` 与 `dist/index.<hash>.js`：生产构建生成的跟踪产物。

### 任务 1：建立移动端布局与自定义打乱红灯

**文件：**

- 修改：`scripts/verify-blecross-recompute.js`（背景色验证之后、其余训练行为验证之前）
- 参考：`src/vue/CrossF2LTrainer/index.html:73-123`
- 参考：`src/vue/CrossF2LTrainer/index.ts:108-145,515-535`

- [x] **步骤 1：增加自定义公式行为测试**

在浏览器验证脚本中保存当前轮次，分别验证合法输入、空白归一化和非法输入：

```js
  const customScramble = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.autoNext = false;
    vm.enterManual();
    vm.customScramble = "  R   U2  F'  ";
    vm.applyCustomScramble();
    const valid = {
      scramble: vm.scramble,
      phase: vm.phase,
      status: vm.statusText,
    };

    const beforeInvalid = {
      scramble: vm.scramble,
      phase: vm.phase,
      scene: vm.world.cube.serialize(),
    };
    vm.customScramble = "R X";
    vm.applyCustomScramble();
    const invalid = {
      scramble: vm.scramble,
      phase: vm.phase,
      scene: vm.world.cube.serialize(),
      status: vm.statusText,
    };
    return { valid, beforeInvalid, invalid };
  });
  if (
    customScramble.valid.scramble !== "R U2 F'" ||
    customScramble.valid.phase !== "observing" ||
    customScramble.invalid.scramble !== customScramble.beforeInvalid.scramble ||
    customScramble.invalid.phase !== customScramble.beforeInvalid.phase ||
    customScramble.invalid.scene !== customScramble.beforeInvalid.scene ||
    !customScramble.invalid.status.includes("打乱公式无效")
  ) {
    throw new Error(`自定义打乱公式行为异常: ${JSON.stringify(customScramble)}`);
  }
```

- [x] **步骤 2：增加 360 px 移动端布局测试**

临时缩小视口，确认公式不再位于按钮行，输入行的全部控件都落在卡片内：

```js
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 740 });
  const mobileScrambleLayout = await page.evaluate(async () => {
    const vm = window.__bleCross;
    vm.customScramble = "R U2 F'";
    await vm.$nextTick();
    const card = document.querySelector(".ble-card").getBoundingClientRect();
    const actions = document.querySelector(".ble-scramble-actions").getBoundingClientRect();
    const row = document.querySelector(".ble-scramble-input-row").getBoundingClientRect();
    const field = document.querySelector(".ble-scramble-input-row .v-text-field").getBoundingClientRect();
    const controls = [...document.querySelectorAll(".ble-scramble-input-row .v-btn")].map(el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    return {
      card: { left: card.left, right: card.right },
      actionsHeight: actions.height,
      row: { left: row.left, right: row.right },
      fieldWidth: field.width,
      controls,
      inlineFormulaCount: document.querySelectorAll(".ble-scramble-actions .scramble-text").length,
    };
  });
  if (
    mobileScrambleLayout.inlineFormulaCount !== 0 ||
    mobileScrambleLayout.row.left < mobileScrambleLayout.card.left ||
    mobileScrambleLayout.row.right > mobileScrambleLayout.card.right + 1 ||
    mobileScrambleLayout.fieldWidth < 120 ||
    mobileScrambleLayout.controls.length !== 2 ||
    mobileScrambleLayout.controls.some(x => x.width < 30)
  ) {
    throw new Error(`手机端打乱区域布局异常: ${JSON.stringify(mobileScrambleLayout)}`);
  }
  await page.setViewportSize(originalViewport);
```

- [x] **步骤 3：增加弹窗与降级复制测试**

通过组件状态打开弹窗，检查完整公式可读宽度，并拦截 `execCommand` 验证复制值：

```js
  const scrambleDialog = await page.evaluate(async () => {
    const vm = window.__bleCross;
    vm.customScramble = "R U2 F'";
    vm.applyCustomScramble();
    vm.scrambleDialog = true;
    await vm.$nextTick();
    const formula = document.querySelector(".ble-scramble-formula");
    const width = formula.getBoundingClientRect().width;
    const shown = formula.textContent.trim();
    const realExecCommand = document.execCommand;
    let copied = "";
    document.execCommand = command => {
      if (command === "copy") copied = document.activeElement.value;
      return true;
    };
    try {
      vm.fallbackCopy(vm.scrambleText, () => {
        vm.statusText = "✅ 已复制打乱公式";
        vm.scrambleDialog = false;
      });
    } finally {
      document.execCommand = realExecCommand;
    }
    return { width, shown, copied, open: vm.scrambleDialog, status: vm.statusText };
  });
  if (
    scrambleDialog.width < 250 ||
    scrambleDialog.shown !== "R U2 F'" ||
    scrambleDialog.copied !== "R U2 F'" ||
    scrambleDialog.open ||
    !scrambleDialog.status.includes("已复制打乱公式")
  ) {
    throw new Error(`打乱信息弹窗或复制异常: ${JSON.stringify(scrambleDialog)}`);
  }
```

- [x] **步骤 4：运行验证并确认红灯原因正确**

运行：

```bash
npm run verify:blecross
```

预期：FAIL，最先报告 `vm.applyCustomScramble is not a function`，证明失败来自尚未实现的自定义打乱入口，而非脚本语法或页面启动错误。

实际：2026-09-23 运行后退出码为 1，首个错误为 `TypeError: vm.applyCustomScramble is not a function`，红灯原因符合预期。

- [x] **步骤 5：提交测试红灯**

```bash
git add scripts/verify-blecross-recompute.js
git commit -m "test(蓝牙训练): 添加手机端打乱区域回归验证"
```

### 任务 2：统一随机和自定义公式开轮流程

**文件：**

- 修改：`src/vue/BleCrossTrainer/index.ts:253-255,304-305,1863-1952`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：增加组件状态与输入入口**

在打乱状态附近增加公开响应式字段：

```ts
  scramble = "";
  customScramble = "";
  scrambleDialog = false;
  private scrambleTarget = "";
```

增加与 CrossF2L 相同的归一化和校验入口：

```ts
  applyCustomScramble(): void {
    const formula = (this.customScramble || "").trim().replace(/\s+/g, " ");
    if (!formula) {
      return;
    }
    const valid = formula.split(" ").every((token) => /^[URFDLB]('2|2'|'|2)?$/.test(token));
    if (!valid) {
      this.statusText = "打乱公式无效 (仅支持 U R F D L B 与 '/2 后缀)";
      return;
    }
    this.startScramble(formula);
  }
```

- [ ] **步骤 2：提取统一开轮方法**

保留 `newScramble()` 作为模板和自动下轮调用入口，让它只负责生成随机公式：

```ts
  newScramble(): void {
    this.startScramble(this.world.cube.twister.scrambler());
  }

  private startScramble(formula: string): void {
    // 原 newScramble 的全部会话检查、失败记录、清理和模式分支留在这里。
    // 手动分支删除局部 scrambler() 调用，直接使用参数 formula。
    // 蓝牙分支删除局部 scrambler() 调用，直接使用参数 formula。
  }
```

提取时保持以下顺序不变：

1. 未连接时进入手动模式；
2. `solving` 阶段记录失败；
3. 清理自动下轮任务；
4. 手动模式重建标准贴纸、应用公式并恢复视角链；
5. 蓝牙模式从 `predicted` 推演目标、重建画面并打开轮次同步窗口。

- [ ] **步骤 3：实现完整公式复制**

复制值统一取 `scrambleText`，成功后关闭弹窗并写入状态提示：

```ts
  copyScramble(): void {
    const text = this.scrambleText;
    if (!text) return;
    const done = () => {
      this.statusText = "✅ 已复制打乱公式";
      this.scrambleDialog = false;
    };
    if (navigator.clipboard && document.hasFocus()) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  private fallbackCopy(text: string, done: () => void): void {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      done();
    } catch {
      this.statusText = "❌ 复制失败，请手动选择复制";
    }
    document.body.removeChild(textarea);
  }
```

- [ ] **步骤 4：运行 TypeScript 与 BLE 状态测试**

运行：

```bash
npm run test:ble
```

预期：`27 通过, 0 失败`，且 TypeScript 编译无错误。

### 任务 3：对齐 CrossF2L 模板与移动端样式

**文件：**

- 修改：`src/vue/BleCrossTrainer/index.html:82-134`（操作行和输入行）
- 修改：`src/vue/BleCrossTrainer/index.html:320` 前（新增打乱信息弹窗）
- 修改：`src/vue/BleCrossTrainer/theme.ts:31-46`（替换旧公式样式）
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：调整操作行并新增输入行**

将原行改为可换行的语义类，删除两个 `.scramble-text` 节点：

```html
          <div class="ble-scramble-actions">
            <!-- 保留 trainMode、新打乱、重置、z2、y、y' 和条件校准按钮 -->
          </div>

          <div class="ble-scramble-input-row">
            <v-text-field
              v-model="customScramble"
              placeholder="输入打乱公式, 回车应用"
              dense
              hide-details
              outlined
              @keyup.enter="applyCustomScramble"
            ></v-text-field>
            <v-btn x-small @click="applyCustomScramble" :style="{height: size * 0.5 + 'px'}">✓</v-btn>
            <v-btn x-small @click="scrambleDialog = true" :disabled="!scramble" title="打乱信息" :style="{height: size * 0.5 + 'px'}">🎲</v-btn>
          </div>
```

- [ ] **步骤 2：增加打乱信息弹窗**

在帮助弹窗之前增加：

```html
    <v-dialog v-model="scrambleDialog" max-width="340">
      <v-card class="help-dialog">
        <v-card-title class="help-title">🎲 打乱信息</v-card-title>
        <v-card-text class="help-body">
          <div style="font-size: 11px; color: #888; margin-bottom: 3px;">打乱公式</div>
          <div class="ble-scramble-formula">{{ scrambleText || "生成中..." }}</div>
        </v-card-text>
        <v-card-actions>
          <v-btn small text color="primary" @click="copyScramble">📋 复制公式</v-btn>
          <v-spacer></v-spacer>
          <v-btn small text @click="scrambleDialog = false">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
```

- [ ] **步骤 3：增加与 CrossF2L 对齐的样式**

用以下样式替换旧 `.scramble-text` 规则：

```css
.ble-card .ble-scramble-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  flex-wrap: wrap;
  row-gap: 4px;
}
.ble-card .ble-scramble-input-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
}
.ble-card .ble-scramble-input-row .v-text-field {
  flex: 1;
  min-width: 0;
  padding: 0;
  margin: 0;
}
.ble-card .v-text-field .v-input__control .v-input__slot {
  background: #f4f6fa !important;
  border: 1px solid #e3e8f0 !important;
  border-radius: 6px !important;
}
.ble-card .v-text-field fieldset {
  border: none !important;
}
.ble-scramble-formula {
  font-family: 'Roboto Mono', Consolas, monospace;
  font-size: 15px;
  color: #333;
  background: #f4f6fa;
  border-radius: 6px;
  padding: 8px 10px;
  line-height: 1.7;
  word-break: break-all;
}
```

- [ ] **步骤 4：运行浏览器验证并确认绿灯**

运行：

```bash
npm run verify:blecross
```

预期：退出码为 0；新增的自定义公式、360 px 布局、弹窗和复制验证均通过。

- [ ] **步骤 5：提交功能实现**

```bash
git add src/vue/BleCrossTrainer/index.ts src/vue/BleCrossTrainer/index.html src/vue/BleCrossTrainer/theme.ts scripts/verify-blecross-recompute.js
git commit -m "fix(蓝牙训练): 对齐手机端打乱区域布局"
```

### 任务 4：完整验证并更新生产构建产物

**文件：**

- 生成：`dist/index.<新哈希>.js`
- 修改：`dist/index.html`
- 删除：`dist/index.<旧哈希>.js`

- [ ] **步骤 1：运行完整 BLE 浏览器验证**

运行：

```bash
npm run verify:blecross
```

预期：退出码为 0，无 `自定义打乱公式行为异常`、`手机端打乱区域布局异常` 或 `打乱信息弹窗或复制异常`。

- [ ] **步骤 2：运行 BLE 单元与协议测试**

运行：

```bash
npm run test:ble
```

预期：`27 通过, 0 失败`。

- [ ] **步骤 3：执行生产构建**

运行：

```bash
npm run build
```

预期：`webpack compiled successfully`，生成新的内容哈希 bundle。

- [ ] **步骤 4：恢复本地搜索表**

生产构建会清理未跟踪的 `dist/cube_cross_table.bin`，运行：

```bash
node scripts/gen-table.mjs dist
```

预期：输出文件大小为 `2661132` 字节；该文件继续保持未跟踪，不加入提交。

- [ ] **步骤 5：检查提交范围**

运行：

```bash
git diff --check -- dist/index.html 'dist/index.*.js'
git status --short
```

预期：构建差异只包含旧 bundle 删除、新 bundle 新增和 `dist/index.html` 哈希更新；`README.md`、`.superpowers/`、`.trae/`、`dist/cube_cross_table.bin` 保持未暂存。

- [ ] **步骤 6：提交构建产物**

```bash
git add dist/index.html dist/index.<旧哈希>.js dist/index.<新哈希>.js
git commit -m "build(蓝牙训练): 更新手机端打乱区域产物"
```

- [ ] **步骤 7：最终核对**

运行：

```bash
git diff --check --cached
git status --short --branch
git log --oneline origin/master..HEAD
```

预期：没有暂存差异；工作区只保留用户已有文件和本地生成文件，待推送提交清单包含设计、计划、测试、实现及构建提交。
