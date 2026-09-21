# BLE Cross 隐藏无关灰色贴纸实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让「隐藏无关」模式的无关贴纸统一显示为 `#80868B`、透明度 `0.10`，同时保持真实魔方颜色和序列化状态不变。

**架构：** 复用现有按原始色字符缓存和注册的 `VIS_SOFT_MATS`，不改变 `VIS_MAT_COLORS` 的真实色映射。仅把 soft 材质的视觉颜色固定为灰色，并将贴纸与骨架透明度拆成两个常量。

**技术栈：** TypeScript、Three.js、Vue 2、Playwright CLI、webpack 5。

---

### 任务 1：锁定灰色隐藏行为

**文件：**
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：编写失败回归**

在可视化回归中开启 `visHide=true`、`visGhost=false`，收集透明贴纸并断言数量大于 0，且每张贴纸满足：

```js
material.color.getHex() === 0x80868b
material.opacity === 0.1
material.transparent === true
material.depthWrite === false
```

同时断言中心块不为灰色、至少存在一张非灰色高亮贴纸，并验证开启与关闭前后 `cube.serialize()` 不变且不含 `?`。

- [ ] **步骤 2：运行红灯**

运行：

```bash
npm run verify:blecross
```

预期：失败，旧 soft 材质仍使用原贴纸颜色和 `0.06` 透明度。

### 任务 2：实现灰色 soft 材质

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：拆分贴纸和骨架透明度**

定义：

```ts
const VIS_SOFT_COLOR = 0x80868b;
const VIS_SOFT_OPACITY = 0.1;
const VIS_FRAME_SOFT_OPACITY = 0.06;
```

`VIS_FRAME_SOFT` 使用 `VIS_FRAME_SOFT_OPACITY`，保持骨架现有效果。

- [ ] **步骤 2：仅固定 soft 材质视觉颜色**

`visMaterialOf()` 在 `mode === "soft"` 时执行：

```ts
mat.color.setHex(VIS_SOFT_COLOR);
```

其他模式继续从 `Cubelet.LAMBERS[color]` 同步原色；`VIS_MAT_COLORS.set(mat, color)` 保持不变。

- [ ] **步骤 3：运行绿灯与 BLE 回归**

```bash
npm run verify:blecross
npm run test:ble
git diff --check
```

预期：浏览器完整回归通过，BLE 21/21，diff 无空白错误。

- [ ] **步骤 4：提交源码、测试和文档**

```bash
git add docs/superpowers/specs/2026-09-21-blecross-hide-gray-design.md docs/superpowers/plans/2026-09-21-blecross-hide-gray.md scripts/verify-blecross-recompute.js src/vue/BleCrossTrainer/index.ts
git commit -m "feat(蓝牙训练): 灰化隐藏模式无关贴纸"
```

### 任务 3：更新生产构建并复验

**文件：**
- 修改：`dist/index.html`
- 替换：`dist/index.<hash>.js`

- [ ] **步骤 1：生成生产包和搜索表**

```bash
npm run build
node scripts/gen-table.mjs
stat -c '%n %s bytes' dist/cube_cross_table.bin
```

预期：webpack 成功，搜索表为 `2661132 bytes`。

- [ ] **步骤 2：提交生产入口**

```bash
git add dist/index.html dist/index.*.js
git commit -m "build(前端): 更新灰色隐藏效果产物"
```

- [ ] **步骤 3：最终验证**

```bash
npm run test:ble
npm run verify:blecross
git diff --check
git status --short
```

预期：BLE 21/21、浏览器完整回归通过，工作区仅保留用户原有 `.trae/`。
