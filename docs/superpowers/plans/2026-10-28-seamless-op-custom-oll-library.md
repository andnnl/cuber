# 无缝 OP 自定义 OLL 分组实现计划

> **面向 AI 代理的工作者：** 按项目偏好在当前工作区内联执行，不创建 worktree，不提交或推送未经本次要求的变更。先红灯后实现。

**目标：** 在“选择 OLL”弹窗添加可持久保存、编辑、删除及多选出题的自定义分组。

**架构：** 自定义公式以稳定 ID、名称、公式的数组存入既有 `seamlessOpSettings`；`ollNames` 按稳定 ID 记录内置／自定义选中项。纯函数负责旧字段迁移、校验与公式池生成；弹窗负责表单、分组及预览；现有 `generateOpCase` 负责出题。无选中项仍表示全部内置，不会因为仅保存自定义公式而改变默认题池。

**技术栈：** TypeScript、Vue 2、Node assert、Playwright CLI、webpack 5。

---

### 任务 1：持久化与题池

**文件：** `src/ble/op-custom-oll.ts`、`scripts/test-op-custom-oll.cjs`、`package.json`。

- [ ] 为 `restoreCustomOlls(saved)` 和 `selectedOllPool(builtin, custom, selected)` 编写测试：旧 `customOll` 迁入一次；旧 `useCustom` 启用时只选迁入项；已有库不重复迁移；无选中仍是内置；可选自定义和内置的混合池；无效存储不会阻断出题。
- [ ] 运行 `tsc -p tsconfig.ble.json && node scripts/test-op-custom-oll.cjs`，确认缺少模块造成红灯。
- [ ] 实现 `CustomOll {name, label, origin}` 及上述纯函数；迁移仅解析有效公式；稳定 ID 为 `custom-legacy`；有效的已保存项只接受 `custom-` 前缀、非空显示名称、解析成功的公式；孤立选择项清理。
- [ ] 将测试脚本加入 `npm run test:op` 并运行。

### 任务 2：弹窗分组和增删改

**文件：** `src/vue/SeamlessOp/index.ts`、`index.html`、`index.css`、`scripts/verify-op-custom-oll.js`。

- [ ] 浏览器测试覆盖：添加两条、选中一条并出题、刷新后恢复、混选内置、编辑保持 ID 和选择、删除清除选择、无效输入显示错误且不会入库，手机布局不溢出。
- [ ] 运行 `playwright-cli -s=op-custom run-code --filename=scripts/verify-op-custom-oll.js`，确认缺少分组而失败。
- [ ] 初始化时读取并迁移旧输入框，使用缓存的预览；新增/编辑先 `validateOpCase(null, item, '', simulate)` 确认 OLL 后可还原，拒绝无效公式并保持当前题；新按钮“内置 / 自定义”切换列表，表单添加/编辑，卡片多选和编辑/删除，保存后出题复用现有 `generateOpCase`。
- [ ] 运行 `npm run build`、`npm run test:op`、原 OLL 弹窗和布局脚本、新浏览器脚本、`git diff --check`；不提交。
