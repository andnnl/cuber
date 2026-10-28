# 全局自定义 OLL 公式库实现计划

> **面向 AI 代理的工作者：** 在当前工作区内联执行，不创建 worktree；用户没有要求提交或推送。

**目标：** 无缝 OP 的自定义 OLL 变成共享公式库，原有公式无损迁移，并在公式库界面提供只读查看与播放。

**架构：** 新增 `cuberCustomOllLibrary` 作为唯一数据源。首次读取从 `seamlessOpSettings` 迁入；无缝 OP 只保存选择 ID 到旧设置，增删改写共享库。公式库运行时从共享库构建自定义 OLL 分组，不写入其 `algs` 旧版配置结构。

**技术栈：** TypeScript、Vue 2、localStorage、Node 测试、浏览器回归测试。

---

### 任务 1：共享库与迁移

**文件：** `src/ble/op-oll-library.ts`、`scripts/test-op-oll-library.cjs`、`package.json`

- [x] 写失败测试：首次从旧版列表及单条自定义公式迁移、保留 ID/名称/公式；共享库建成后不从旧设置覆盖；空列表也是有效数据。
- [x] 运行测试确认红灯。
- [x] 编写读取/写入函数，按 `restoreCustomOlls` 校验数据；首次迁移时落盘。
- [x] 运行测试确认绿灯。

### 任务 2：无缝 OP 接入共享库

**文件：** `src/vue/SeamlessOp/index.ts`、`scripts/verify-op-custom-oll.js`

- [x] 增加浏览器验证：保存后共享库存在，旧设置不再保存列表，刷新与编辑/删除同步。
- [x] 确认测试红灯。
- [x] 在装载、保存、删除时改为使用共享库；旧设置只保存选择 ID，迁移保留旧单条行为。
- [x] 浏览器验证绿灯。

### 任务 3：公式库只读分组

**文件：** `src/vue/Algs/index.ts`、`src/vue/Algs/index.html`、`scripts/verify-op-global-library.js`

- [x] 增加浏览器验证：从无缝 OP 保存后，公式库出现自定义分组；选择公式显示名称/内容且可播放；无编辑删除按钮；切换回来刷新。
- [x] 确认测试红灯。
- [x] 保持内置 3 组和旧 `algs` 存储不变，运行时创建自定义分组，激活时刷新；自定义公式只读。
- [x] 运行浏览器回归、`npm run test:op`、`npm run build`，检查 `git diff --check`。
