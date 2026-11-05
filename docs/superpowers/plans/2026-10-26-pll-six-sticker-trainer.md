# PLL 六格观察训练首阶段实现计划

> **面向 AI 代理的工作者：** 按用户要求在当前工作区内联执行，不创建 worktree；已有未提交 Windows 蓝牙改动不纳入本次提交。使用 TDD 和完成前验证。

**目标：** 建立 21 种 PLL 随机案例的观察判题、实体六面还原计时、成绩列表与九类静态学习资料。

**架构：** 将案例抽选和计时状态机放在独立的 `src/ble/pll-training.ts`，Vue 视图只负责 3D 展示、菜单、存储和向状态机转发蓝牙事件。AppShell 为训练模式开辟专用事件入口，不把实体转动改写到展示案例。学习资料沿用用户核对的 Markdown 文档。

**技术栈：** TypeScript、Vue 2、Three.js、Node assert、webpack。

---

### 任务 1：案例与实体状态

**文件：** 创建 `src/ble/pll-training.ts`；测试 `scripts/test-pll-training.cjs`。

- [x] 编写测试：固定随机源检查 21 项抽取与两个 AUF；错误答案留在原题，正确答案切题；实体首次 MOVE 开始计时，恢复 MOVE 忽略，六面还原完成并记录耗时；重试重置。
- [x] 运行 `npm run test:pll`，确认模块不存在导致失败。
- [x] 实现最小状态机和有效 facelets 六面还原判断；再次运行测试。

### 任务 2：训练界面和资料

**文件：** 创建 `src/vue/PllObservation/{index.ts,index.html,index.css}`；修改 `src/vue/AppShell/index.ts`、`src/ble/app-route.ts`、`src/vue/Setting/{index.ts,index.html}` 和 `webpack.config.js`。

- [x] 创建案例 3D 魔方：AUF → PLL 逆公式 → AUF，展示 21 个名称按钮、错误反馈、Esc/清除、计时、成绩及九类学习表。
- [x] AppShell 仅将当前训练页的实体 MOVE/facelets 交给其状态机；其余页面和跟随开关行为不变。
- [x] 在导航菜单注册 `?mode=pll6`；保留用户已核对的资料原文，不新增特征自动识别。

### 任务 3：验证与交付

- [x] 运行 `npm run test:pll`、`npm run test:ble`、`npx tsc --noEmit`、`npm run build`。单独 `tsc --noEmit` 仍因仓库既有 `src/wasm/cube_cross_solve.d.ts:1` 的相对 ambient module 声明报 TS2436；生产 webpack 构建通过。
- [x] 检查工作区差异，向用户说明本地入口及九类程序自动验证仍后置；本轮不提交推送。
