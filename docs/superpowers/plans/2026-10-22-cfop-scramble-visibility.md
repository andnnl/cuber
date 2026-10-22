# CFOP 公式打乱与播放可视化实现计划

> **面向 AI 代理的工作者：** 内联执行；按 TDD 红绿循环推进。现有工作区有用户改动，不使用 worktree，不自动提交。

**目标：** 公式直接打乱 3D 魔方，播放十字／F2L 时可选择隐藏无关块或半透明。

**架构：** `scramble.ts` 校验并规范化输入，`visibility-targets.ts` 按阶段产出贴纸身份；`CfopLearning` 仅编排输入、状态和现有材质绘制。

**技术栈：** TypeScript、Vue 2、Three.js、Node assert、webpack。

---

### 任务 1：公式输入

**文件：** 新建 `src/vue/CfopLearning/scramble.ts`；修改 `src/vue/CfopLearning/index.ts` 和 `index.html`；测试 `scripts/test-cfop-input-visibility.js`。

- [x] 先用 Node assert 写 `normalizeCfopScramble('R U2 z2')`、无效 token、空串、54 位状态测试并运行，确认缺少导出而失败。
- [x] 实现校验函数并重新运行至通过；在按钮中先校验，随后取消旧路线、调用现有 `twister.setup` 或 `paintFrame`、恢复视角、按自动十字选项搜索。
- [x] 验证输入按钮、错误提示与随机打乱兼容。

### 任务 2：目标块和材质

**文件：** 新建 `src/vue/CfopLearning/visibility-targets.ts`；修改 `src/vue/CfopLearning/index.ts` 和 `index.html`；扩展 `scripts/test-cfop-input-visibility.js`。

- [x] 先断言十字四棱、当前／下一组角棱及 `z2` 实体签名，运行确认失败。
- [x] 实现纯函数；在每次刷新追踪之前重绘材质，关闭时恢复普通材质；开关变化立即重绘。
- [x] 验证跳步、动画与现有实体跟练共用的追踪刷新入口。

### 任务 3：验证

- [x] 运行 `node scripts/test-cfop-input-visibility.js` 和现有 `node scripts/test-cfop-ui.js`、`node scripts/test-cfop-route.js`。
- [x] 运行 `npx tsc --noEmit --skipLibCheck` 和项目构建；检查 `git diff --check` 与变更范围。
