# 无缝 OP 窗口联动与 OLL 批选实现计划

> **面向 AI 代理的工作者：** 在当前工作区内联执行；不创建 worktree，不提交未授权的已有变更。

**目标：** 点击六格窗口时同步选中对应两面；OLL 弹窗能对当前分组全选和取消。

**架构：** 复用 `settings.destinationFaces` 和 `settings.ollNames`。窗口点击覆盖终点面集合，之后仍可单独调整；OLL 批量操作按当前分组的稳定 ID 合并或删除，不影响另一组。空选择维持既有的默认内置池语义。

**技术栈：** Vue 2、TypeScript、Playwright 页面验证、webpack。

---

### 任务 1：窗口与终点面联动

**文件：** `scripts/verify-op-destination-filter.js`、`src/vue/SeamlessOp/index.ts`

- [ ] 在浏览器测试中点击 F/R、R/B、B/L、L/F，逐一检查 `aria-pressed` 恰好包含对应两面；手动切换一面后再次点窗口能恢复窗口对应状态；刷新后保存结果。
- [ ] 运行浏览器测试确认失败，失败原因应为窗口未同步终点面。
- [ ] 在 `selectOpWindow(view)` 中通过映射更新 `settings.destinationFaces` 并保存；保留清除当前箭头选择。
- [ ] 重新运行浏览器测试确认通过。

### 任务 2：OLL 分组批量选择

**文件：** `scripts/verify-op-oll-picker.js`、`src/vue/SeamlessOp/index.ts`、`src/vue/SeamlessOp/index.html`

- [ ] 在浏览器测试中验证内置全选 57 条、取消清空并展示默认语义；自定义分组全选/取消只改自定义 ID；混选时保持另一组不动。
- [ ] 运行浏览器测试确认失败，失败原因应为批量按钮不存在。
- [ ] 新增 `selectAllOlls` 与 `clearOllSelection`，分别按当前分组 ID 并集和差集更新选择、保存设置；弹窗新增两个按钮和空选提示。
- [ ] 重新运行浏览器测试，运行 `npm run test:op` 与 `npm run build`；检查 `git diff` 保留原工作区更改。
