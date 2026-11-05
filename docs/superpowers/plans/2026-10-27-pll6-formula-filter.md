# PLL 六格公式多选实现计划

> **面向 AI 代理的工作者：** 在主工作区内联执行此计划（用户已指定不使用 worktree、默认内联）；先写测试确认失败，再写实现，每一步完成后验证。只操作本任务文件，不提交其他工作区改动。

**目标：** 在 PLL 六格训练页以手机友好的底部弹层选择随机案例公式，支持长按划选；空选为全部随机。

**架构：** `PllTraining` 保存可选名称集合，只在 `next()` 生成案例时筛选，不改已在进行的题目。Vue 页面管理弹层草稿、持久化和触摸手势。现有答题按钮保持全部 21 个。

**技术栈：** TypeScript、Vue 2、Node assert、Playwright CLI、webpack。

---

## 文件与职责

- `src/ble/pll-training.ts`：合法名称归一化和随机池选择。
- `scripts/test-pll-training.cjs`：空选、单／多选、非法名及当前题不变的红绿测试。
- `src/vue/PllObservation/index.ts`：持久化、弹层草稿、保存取消、长按划选和焦点。
- `src/vue/PllObservation/index.html`、`index.css`：入口、底部弹层和手机触控布局。
- `scripts/verify-pll6-formula-filter.js`：手机尺寸的点击、滚动、长按划选、关闭与持久化浏览器回归。

### 任务 1：训练随机池

- [x] 在 `scripts/test-pll-training.cjs` 增加 `training.setAllowedNames(['PLL-3'])` 后 `current` 引用不变、连续 `next()` 只取 `PLL-3`；传空数组、非法名称回退全池；给两个名称时随机端点分别取第一和第二。运行 `npm run test:pll`，预期因方法不存在失败。
- [x] 在 `PllTraining` 增加 `private allowedNames: Set<string> = new Set()` 和 `setAllowedNames(names: string[]): void`；仅保留在 `items` 中的名称，`next()` 从 `allowedNames.size ? items.filter(...) : items` 均匀选取，三个随机调用的数量和顺序不变。重跑 `npm run test:pll` 预期通过。

### 任务 2：弹层与存储

- [x] 在浏览器脚本断言入口「选择公式 · 全部」、弹层 21 项、取消不保存、保存单项后当前题不变且新案例落在所选集合、刷新后按钮显示「1 条」、清空后全部随机、答题区始终 21 项；运行脚本，预期找不到入口失败。
- [x] Vue 页面添加已保存 `selectedNames` 与弹层草稿 `draftNames`，`mounted()` 读取 `pll6AllowedNames` 并按公式库过滤，设置训练随机池；已生成但不符合筛选的初始案例在首次展示前切到允许案例。`openPicker()` 克隆草稿；`savePicker()` 更新随机池及 localStorage 但不调用 `next()`；`cancelPicker()` 只关闭并丢弃草稿。
- [x] HTML 增加入口、遮罩、dialog 语义、头部「全选／清空」、21 个大格、底部「取消／保存」；CSS 限宽、最大高度、独立滚动列表、四列并在窄屏变为三列；运行浏览器脚本到上述断言通过。

### 任务 3：长按划选与移动回归

- [x] 浏览器先测试普通纵向手势不选、长按 350 ms 后从未选项划过两项批量选中，从已选项划过两项批量取消、单击不受合成 click 干扰；预期失败。
- [x] 在列表 `touchstart` 保存起点、名称与 350 ms 定时器；超出 8 px 且尚未长按时取消定时器、保留原生滚动；长按后切换起点并按该目标状态对 `touchmove` 命中的新格只设置一次，必要时 `preventDefault()`；`touchend/cancel` 清理，抑制随后合成 click。弹层关闭及组件销毁也清理计时器。
- [x] `Esc` 先关闭弹层再执行原训练重试。用浏览器检查手机尺寸 21 项可滚动、保存／取消固定可见、遮罩关闭不保存、无触摸残留；运行全部浏览器回归。

### 任务 4：完成验证

- [x] 运行 `npm run test:pll`、`npm run test:ble`、`npm run build`、`scripts/verify-pll6-computed.js`、`scripts/verify-pll6-record-replay.js`、新浏览器脚本和 `git diff --check`，检查失败数及当前工作区差异。
- [x] 仅在用户要求提交时精确暂存本任务文件；本计划不发布或推送。
