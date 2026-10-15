# BLECross 推荐朝向与播放实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 内联执行；每项先测红灯，再实现绿灯。

**目标：** 显示推荐正面中心块颜色，并在推荐预览前转到相应正面。

**架构：** `recommendation-preview.ts` 只负责快照视角到颜色和 y 转向的纯映射；训练器将映射用于模板与现有预览重建函数。推荐公式使用 `displayMoves`，普通最优公式沿用旧链。

**技术栈：** TypeScript、Vue 2、Three.js、Node assert、Playwright CLI。

---

## 文件职责

- `src/vue/BleCrossTrainer/recommendation-preview.ts`：固定基准中心块颜色及朝向转正映射。
- `src/vue/BleCrossTrainer/index.ts`：推荐标题方法、3D 转正、预览记号分流。
- `src/vue/BleCrossTrainer/index.html`：列表、弹窗、筛选与已选摘要文案。
- `scripts/test-blecross-recommendation-preview.js`：映射单元测试。
- `scripts/verify-blecross-recommendation-display.js`：浏览器集成回归。

### 任务 1：朝向映射

- [x] 编写 `scripts/test-blecross-recommendation-preview.js`，断言 F/R/B/L 的默认颜色，`[{axis:'z', times:2}]` 后 R 对应橙，`[{axis:'y', times:1}]` 后 F 对应红，以及各朝向转正后 `baseOpsFaceCharMap` 的前面为 F。
- [x] 运行 `node scripts/test-blecross-recommendation-preview.js`，确认因缺少映射函数而失败。
- [x] 实现纯函数 `recommendationFrontColor(front, ops)` 与 `recommendationFrontTurn(front)`，前者反查 `baseOpsFaceCharMap(ops)`，后者返回 0/1/2/-1 次 y 转。
- [x] 重跑单元测试，确认通过。

### 任务 2：预览与文案

- [x] 扩展浏览器回归，点击推荐卡片的播放／步进／GIF，断言卡片文字颜色、3D 中心块的正面身份、公式落定状态和训练数据不变；运行确认旧代码失败。
- [x] 在 `resetBestPreview` 的推荐分支恢复视角链后加入 y 转正；`bestMovesOf` 的推荐分支返回选中项 `displayMoves`，不改变其他预览分支。
- [x] 在模板的列表、全屏、筛选框、已选公式中通过同一 `recommendationFrontLabel` 显示字母与颜色；重跑浏览器回归确认通过。

### 任务 3：整体验证

- [x] 运行 `node scripts/test-cross-analysis.js`、新单测、浏览器回归和 `NODE_OPTIONS=--openssl-legacy-provider npm run build`。
- [x] 审核 `git diff --check` 和 `git status --short`，不纳入原有 README、`.superpowers/`、`.trae/` 改动。
