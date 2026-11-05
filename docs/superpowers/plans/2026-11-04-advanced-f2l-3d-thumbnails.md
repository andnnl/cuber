# 非标 F2L 三维缩略图与 z2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。本项目采用内联执行，不使用 worktree。

**目标：** 将案例网格改为小型等角 3D 魔方，手机一行三张；z2 同步作用于案例缩略图与主魔方并记忆。

**架构：** 独立状态计算模块从本地案例 `setup` 缓存普通／z2 两套 U/F/R 贴纸；Vue 页使用 CSS 3D 呈现贴纸、负责切换选中和配色；主魔方按 z2 状态重建题面。

**技术栈：** TypeScript 4.3、Vue 2、Three.js（主魔方）、CSS 3D、Node.js 测试、webpack 5。

---

## 文件职责

- `src/ble/adv-f2l.ts`：导出归一化 setup 的面向案例状态与 z2 状态生成函数。
- `src/vue/AdvancedF2L/index.ts`：缓存两套预览贴纸，读取／保存 z2，切换公式时重建主魔方。
- `src/vue/AdvancedF2L/index.html`：z2 复选框和卡片内三面九格结构。
- `src/vue/AdvancedF2L/index.css`：等角三维面、边框、缩放与三列响应式布局。
- `scripts/test-adv-f2l.cjs`：54 案例双朝向 54 格状态及正向回放验证。

### 任务 1：状态与 z2 测试

- [x] 在 `scripts/test-adv-f2l.cjs` 为 `advancedF2LPreview(item, z2)` 编写失败断言：所有 54 个案例两个朝向都返回三个九格面且字符仅有 `URFDLB`，第一例正常与 z2 状态不同。
- [x] 运行 `npm run test:adv-f2l`，确认因函数缺失失败。
- [x] 在 `src/ble/adv-f2l.ts` 用 `Cube.twister.setup((z2 ? 'z2 ' : '') + normalize(item.setup))` 实现函数；不创建每张卡独立 WebGL 场景。
- [x] 增加选中公式 z2 起点回放测试：同一公式 `z2 + inverse + moves` 为还原态，且与正常朝向起点不同；运行测试确认通过。

### 任务 2：界面与交互

- [x] 在 `scripts/test-adv-f2l.cjs` 加入模板结构与 `z2` 控制源码断言；运行测试见红。
- [x] 在页面 `mounted` 为两种朝向预生成 54 案例 U/F/R 贴纸，不把颜色固定为默认配色；使用 `palette.getColor(face)` 将贴纸转换为当前有效配色。
- [x] 模板中加入 `<input type="checkbox" aria-label="z2" ...>`；变更时写 `advF2LZ2` 并调用 `rebuild()`，主魔方公式由 `z2 + inverse` 建起点；切换停止旧动画、步骤归零。刷新时读存储值。
- [x] 用三个 `rotateX/rotateY/translateZ` 面和九格贴纸绘制缩略图；手机 390px 与 320px 均三列且无横向溢出。
- [x] 运行 `npm run test:adv-f2l`、`npm run build`；浏览器逐步播放、z2 切换、刷新保持选择、手机无溢出；`git diff --check`。
- [x] 只提交本任务相关文件，不将既有脏工作区与 `dist` 产物混入提交。
