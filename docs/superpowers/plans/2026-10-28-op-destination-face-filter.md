# 无缝 OP 箭头目的地面过滤实现计划

> **面向 AI 代理的工作者：** 在当前工作区内联执行，不创建 worktree；用户未要求提交。本计划按测试先行执行。

**目标：** 六格观察窗口下增加 L、F、R、B 四个独立按钮，按箭头目的地面过滤；U 面箭头不受影响。

**架构：** `op-top-net.ts` 提供仅处理贴纸目的地编号和面集合的纯过滤函数；`SeamlessOp` 将选择写入既有设置，并在现有 `netArrows` 计算之后过滤。展开图和窗口覆盖值不随过滤变化。

**技术栈：** TypeScript、Vue 2、webpack、现有 Node assert 测试和 Playwright 页面检查。

---

### 任务 1：纯函数及回归测试

**文件：** `src/ble/op-top-net.ts`；`scripts/test-op-top-net.cjs`。

- [ ] 在 `scripts/test-op-top-net.cjs` 构造终点为 U/L/F/R/B 的五条箭头，断言取消 F 后仅 F 消失，四面全关后 U 仍存在，全部选择时保持原数组。
- [ ] 运行 `PATH=/home/andnnl/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:op`，验证测试因缺少过滤函数而失败。
- [ ] 在 `op-top-net.ts` 实现 `filterOpDestinationArrows(arrows, selectedFaces)`：目标编号 9–17=R、18–26=F、36–44=L、45–53=B；其他面不过滤。
- [ ] 重跑 `npm run test:op` 验证通过。

### 任务 2：UI、记忆及浏览器验证

**文件：** `src/vue/SeamlessOp/index.ts`、`index.html`、`index.css`；`scripts/verify-op-destination-filter.js`。

- [ ] 浏览器测试断言四按钮在窗口按钮下方、默认全选、关闭 F 仅消失终点为 F 的箭头、开启后恢复、刷新后保留选中状态、无箭头时显示提示、手机宽度不溢出。
- [ ] 运行 `playwright-cli -s=op-filter run-code --filename=scripts/verify-op-destination-filter.js` 验证新增用例失败。
- [ ] 在既有设置中存 `destinationFaces` 数组，初始化时过滤为 L/F/R/B 合法值；缺失字段默认全选。四按钮通过 `toggleDestinationFace()` 独立控制，筛选发生在 `netArrows` 末尾，不修改窗口、题目或色块。
- [ ] 编译：`PATH=/home/andnnl/.nvm/versions/node/v22.22.0/bin:$PATH NODE_OPTIONS=--openssl-legacy-provider npm run build`。重跑 `npm run test:op`、浏览器检查与 `git diff --check`；仅报告结果，不提交。
