# 公式计时蓝牙断档补步实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）跟踪进度。本项目按 AGENTS.md 偏好内联执行，不使用 worktree。

**目标：** 公式计时实体转动缺通知时补齐 3D 动作，无法精确计时的末步补回不记有效成绩。

**架构：** 独立的实体状态账本保留权威 FACELETS 基线、轮次及已收到的 MOVE；正常动作实时输出，缺口由当前轮状态帧唯一反推并按序补回。页面只把已确认或无缺口的动作映射到随机题面，计时器在状态核验期间暂缓停转失败。

**技术栈：** TypeScript、Vue 2、现有 `applyFaceletMove`、Node 断言脚本、webpack。

---

## 文件职责

- 新建 `src/ble/formula-timer-recovery.ts`：实体转动账本、序号缺口与有界唯一补步推断；不依赖 Vue 和 3D 动画。
- 新建 `scripts/test-formula-timer-recovery.cjs`：直接验证纯账本中间缺步、末步缺步、重复与迟到、轮次重置、歧义。
- 修改 `src/ble/formula-timer.ts` 与 `scripts/test-formula-timer.cjs`：等待权威状态时冻结停转结算，时间未知时不产生成功成绩。
- 修改 `src/vue/FormulaTimer/index.ts` 与 `index.html`：接入 FACELETS、请求末步校验、补步动画与状态提示；轮次隔离。
- 修改 `package.json`：新测试纳入 `test:formula-timer`；只暂存本行的变更，不带入现有打包脚本改动。

### 任务 1：纯账本

- [ ] **步骤 1：写失败测试。** 在 `scripts/test-formula-timer-recovery.cjs` 构造 `solved` 和 `applyFaceletMove`，用 `start(solved, 40)`，`move("F'", 41, 100)`，`move('B', 43, 120)`，`state(applyFaceletMove(applyFaceletMove(applyFaceletMove(solved,"F'"),"U"),'B'), 43)`；预期输出补 `U`、`B`，且没有重复 `F'`。再覆盖尾部缺 `B`、跨轮旧帧、重复序号和多解终态。
- [ ] **步骤 2：运行红灯。** `npm run test:formula-timer`；预期测试因账本模块不存在而失败。
- [ ] **步骤 3：实现。** 账本输入 `move(token, serial, at, recovered)` 返回可播放动作数组及缺口状态；`state(facelets, serial)` 枚举最多 2 个缺失序号上每个 12 种四分之一转，先应用已知动作，再仅对唯一匹配的候选按序输出，返回 `recoveredTail`／`uncertain`。所有状态比对使用 `applyFaceletMove`，不能直接改 3D 题面。
- [ ] **步骤 4：运行绿灯。** `npm run test:formula-timer`；账本测试全部通过。
- [ ] **步骤 5：只暂存新账本和测试并提交。** `git add -- src/ble/formula-timer-recovery.ts scripts/test-formula-timer-recovery.cjs`；`git diff --cached --check`；`git commit -m 'fix(公式计时): 增加实体转动断档账本（任务 1）'`。

### 任务 2：计时与页面接线

- [ ] **步骤 1：写失败测试。** 在 `scripts/test-formula-timer.cjs` 覆盖「权威状态核验期间停转 2 秒不产生失败成绩」「中间缺步保持后续实时末步时间」「末步时间未知只恢复画面，成绩不进历史」。添加页面接线断言：`handlePhysicalEvent` 消费 `facelets`，每轮清除账本并以轮次屏蔽异步状态。
- [ ] **步骤 2：运行红灯。** `npm run test:formula-timer`，确认所加断言失败。
- [ ] **步骤 3：实现。** `FormulaTimer` 增加 `holdForVerification()` 和 `releaseVerification()`；页面正常实时动作沿用 `advanceDisplayedCube`，缺口先缓存，补齐后按序进入逻辑魔方和动画。每次短暂停转后请求 FACELETS；结果确认前不结算。尾部补步只恢复画面并提示重试同题，调用 `interrupt` 留下非成功记录；多解／超时也停止并提示，不计有效速度。切题、重连、停用页面时递增轮次、丢弃过期请求。
- [ ] **步骤 4：运行绿灯。** `npm run test:formula-timer` 和 `npm run test:ble`。
- [ ] **步骤 5：在混合改动文件中只暂存本任务相关 hunk；若无法安全拆分，不提交这些文件并在交付时说明。**

### 任务 3：端到端和回归

- [ ] **步骤 1：核对题面状态。** 用模拟事件运行 F2L／OLL／PLL、z2、断档后迟到 FACELETS、跨题旧响应；验证正常流即时显示，补步后画面正确且无双计。
- [ ] **步骤 2：运行 `npm run test:formula-timer && npm run test:ble && npm run build`；确认三个命令退出码均为 0。**
- [ ] **步骤 3：运行 `git diff --check` 并检查本次文件差异；不得覆盖或带入原有未提交改动。**
- [ ] **步骤 4：报告设备实测边界。** 没有实际蓝牙设备时明确标注脚本验证与真机待验的区别。
