# 自定义 OLL 双格式导入导出实现计划

> **面向 AI 代理的工作者：** 默认内联执行（项目 `AGENTS.md` 指定），每项先红灯再绿灯。

**目标：** 自定义 OLL 库可导出 JSON/TXT、合并导入并安装到本机 Linux 桌面版。

**架构：** 纯函数负责文件解析、规范化去重、改名和容量校验；Vue 组件负责读取文件、触发下载、一次性存储并更新响应式列表。现有 `cuberCustomOllLibrary` 键与训练记录不变。

**技术栈：** TypeScript、Vue 2、Node assert、webpack、Electron AppImage。

---

## 文件职责

- 新建 `src/ble/op-oll-transfer.ts`：两种格式序列化、解析与合并。
- 新建 `scripts/test-op-oll-transfer.cjs`：纯函数往返、去重、改名和异常回归。
- 修改 `src/vue/SeamlessOp/index.ts`、`index.html`、`index.css`：下载按钮、文件选择和错误／成功提示；仅成功后保存共享库。
- 新建 `scripts/verify-op-transfer.js`：浏览器交互测试；更新 `package.json` 的 `test:op`。
- 更新本机 `~/.local/opt/cuber/` 的 AppImage 和 `~/.local/share/applications/cuber.desktop`，保留旧文件。

### 任务 1：纯函数与单元测试

- [ ] 在 `scripts/test-op-oll-transfer.cjs` 先写测试：`exportCustomOlls(items,'json'|'txt')` 往返、`名称|公式`、仅公式行；`mergeCustomOlls(existing,text,format,validate)` 跳过同转动公式（含括号/空格差异）、同名自动后缀、文件内重复、无效公式和超过 100 条抛错且不改传入数组。
- [ ] 运行 `npm run test:op` 确认新增测试因导出函数缺失而失败。
- [ ] 在 `src/ble/op-oll-transfer.ts` 实现 UTF-8 文本格式与版本 1 JSON 格式。对每条调用 `parseOpFormula(origin).moves.join(' ')` 生成去重键；调用 `validate(customOllItem(item))` 校验；名称后缀 ` (2)` 等，确保长度不超 40；用不冲突的 `custom-` ID，合并最多 100 条。输入超过 1 MiB 时拒绝。
- [ ] 运行 `npm run test:op`；通过后提交任务 1。

### 任务 2：页面操作与浏览器回归

- [ ] 在 `scripts/verify-op-transfer.js` 先写交互断言：打开自定义分组，两个导出按钮下载文件；上传 `.txt`/`.json`，原公式保留、同名新公式改名、重复跳过；错误文件库不变；公式库页面展示新条目。
- [ ] 运行浏览器脚本，确认按钮缺失造成预期失败。
- [ ] 在 `index.html` 自定义分组放两个下载按钮及 `accept=".json,.txt"` 的隐藏文件输入，显示导入反馈。在 `index.ts` 从当前库导出 Blob，按扩展名解析文件，合并校验后先写入 `saveCustomOllLibrary`，再更新 `settings.customOlls` 和预览；`index.css` 维持移动端按钮换行。
- [ ] 运行 `npm run test:op`、浏览器脚本和 `npm run build`；通过后提交任务 2。

### 任务 3：本机安装与验证

- [ ] 运行 `npm run test:desktop`、`npm run test:linux-scanner`、`npm run desktop:linux -- --publish never`；若 Electron 下载卡住，使用本机已缓存的 Linux Electron 分发包构建。
- [ ] 验证 AppImage 内有新页面资源与扫描辅助程序，并校验文件哈希。
- [ ] 先读取当前快捷方式与安装目录，仅复制新 AppImage 到 `~/.local/opt/cuber/` 的新文件名并将快捷方式的 `Exec` 指向新文件；旧 AppImage 与 `~/.config/cuber` 原样保留。
- [ ] 启动新版并确认本地页面能打开，检查快捷方式与进程；报告版本、文件位置、测试结果。未经另行请求不推送或发布 Release。
