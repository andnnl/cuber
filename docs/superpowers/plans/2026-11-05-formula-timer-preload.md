# 公式计时双魔方预打乱实现计划

> 按 executing-plans 内联执行；不创建分支、不提交、不改动已有 dist 产物。

**目标：** 保留普通模式，以勾选框启用预打乱，并支持左右轮流或左侧固定操作。成功后立即切换到已显示的下一题，每题独立计时。

**架构：** 保留当前 World、输入入口及计时器。用独立、只读的 Three.js 组件展示预生成题面，以 CSS 排序实现左右轮流。下一题保留完整 FormulaCase（含实际打乱与初始贴纸），激活时不重新随机；补充预览发生在下一题计时开始前。

**技术栈：** Vue 2、TypeScript、Three.js，沿用 Node 断言测试和 Playwright CLI 浏览器验证。

## 文件职责
- `src/ble/formula-timer-store.ts`：模式持久化及旧设置兼容。
- `src/vue/FormulaTimer/index.ts`：下一题缓存、无延时切题、布局及生命周期。
- `src/vue/FormulaTimer/NextCube.ts`：独立只读预览，不监听输入、不改变全局动画。
- `src/vue/FormulaTimer/index.html`、`index.css`：开关、布局选择、两列魔方及题面说明。
- `scripts/test-formula-timer-preload.cjs`、`scripts/verify-formula-timer-preload.js`：状态流转与真实浏览器回归。

## 审查重点
- 预览题和激活题的打乱、颜色及朝向必须完全相同。
- 自动成功切题不能沿用上一轮蓝牙核验定时任务，也不能把后续动作吞进旧题。
- 重试保留待练题；更换类别、筛选、随机 U 等设置需清掉旧待练题。
- 普通模式仍等待 700ms；预打乱仅成功立即切题，失败和断连保留现有处理。
- 预览不可转动；统计、复盘、离开页面不训练隐藏题目，不泄漏 WebGL 上下文。

## 执行清单
- [x] 增加持久化与双模式状态流转失败测试。
- [x] 实现模式设置、下一题缓存、无延时切题与核验隔离。
- [x] 实现并排只读预览、两种位置布局和小屏适配。
- [x] 运行公式计时与输入回归、类型检查及临时目录构建。
- [x] 浏览器验证两种布局、连续实体输入、鼠标键盘、预览只读及模式持久化。

## 验证记录
- `npm run test:formula-timer`：11 组脚本全部通过。
- `npm run test:ble`：83 项通过；`npm run test:pll`、`npm run test:op` 全部通过。
- `npx tsc --noEmit --skipLibCheck --pretty false`：通过。跳过已有 WASM 声明文件的问题。
- 开发构建输出至 `/tmp/cuber-formulatimer-preload-build`，未修改 `dist`。
- Playwright：两种布局连续成功、预览与激活题面一致、预览只读、重试保留下一题、独立计时、设置持久化、统计页隔离、390px 小屏及恢复普通模式通过。
- 鼠标、触摸、键盘逆转和整体转、混合输入及无关断连回归通过。
- 实体输入使用 mock 会话连续发送两题动作验证，无真实硬件验证。
