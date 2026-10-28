# 无缝 OP 双展开图与 z2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 内联逐任务执行；本项目不使用 worktree／子代理。

**目标：** 3D 魔方下显示当前／OLL 后顶层展开图，按贴纸轨迹画箭头，支持记忆 z2 出题并复盘。

**架构：** 纯映射模块负责展开图索引与贴纸身份箭头；题目生成器负责 z2 下的案例校验；Vue 页面只负责渲染、配色与交互。继续使用现有记录、3D 世界和 OLL 轨迹。

**技术栈：** TypeScript、Vue 2、Three.js、Node assert、webpack。

---

## 文件职责

- `src/ble/op-top-net.ts`：U/L/F/R/B 顶层索引及箭头投影，纯逻辑。
- `src/ble/op-case.ts`：z2 题面构造和校验。
- `src/ble/op-training.ts`：同题替换、记录 z2、历史兼容复盘。
- `src/vue/SeamlessOp/index.ts|html|css`：记忆开关、双图、配色和响应式布局。
- `scripts/test-op-top-net.cjs|test-op-case.cjs|test-op-training.cjs|verify-op-ui.js`、`package.json`：回归。

### 任务 1：双图索引和轨迹

- [x] 写失败测试：U 九格 0–8；F 18–20，L 36–38，R 11/10/9，B 47/46/45；左图仅 18 格，右图 21 格，角透明；U 转动的贴纸箭头在当前步和末步正确投影。
- [x] 运行 `npm run test:op`，确认新测试红灯。
- [x] 实现 `op-top-net.ts` 导出 `topNetCells(panel)`、`topNetArrows(positions, step)`；右图未揭示时由 Vue 遮色。
- [x] 运行 `npm run test:op`，确认转绿。

### 任务 2：z2 同题生成与记录

- [x] 写失败测试：z2 与非 z2 题保持目标 PLL/OLL/y；z2 置于开头；无 PLL 完成还原；所有记录存 z2，历史记录默认 false；同题替换后计时重置。
- [x] 运行 `npm run test:op`，确认红灯。
- [x] 扩展 `validateOpCase`、`generateOpCase` 接收末尾 `z2=false`；新增 `OpTraining.replace`，记录与复盘保留 z2。
- [x] 运行 `npm run test:op`，确认转绿并覆盖 21×57×4 的 z2 组合。

### 任务 3：页面和配色

- [x] 在浏览器脚本加入题前右图遮色、题后揭示、z2 重建同题、步进与配色及手机无横向溢出的断言。
- [x] 在界面接入双图，格子颜色通过 `palette.getColor(facelet)` 获取；左图 B 留白，右图 B 显示；箭头只叠加左图。
- [x] z2 选项写入既有 settings，切换时校验同题并恢复播放/计时；失败回退旧状态并提示。复盘时 UI 与记录一致。
- [x] 运行 `npm run test:op`、`npm run build`、浏览器脚本和 `git diff --check`；复查既有 dist 用户改动，未加入提交。
