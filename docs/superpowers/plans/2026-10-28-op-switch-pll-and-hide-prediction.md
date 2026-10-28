# 无缝 OP：换 PLL 重试与隐藏预测图实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 内联执行此计划。步骤使用复选框跟踪进度。

**目标：** 在无缝 OP 加入保留 OLL／朝向的换 PLL 重试，以及可记忆的预测图隐藏开关。

**架构：** `op-case` 纯函数根据旧案例与可选 PLL 池重新构造并验证新案例。Vue 组件调用现有 `OpTraining.replace`，复用 `loadCase` 清理播放状态；预测图隐藏用现有设置存储链路。

**技术栈：** TypeScript、Vue 2、Node assert、webpack、playwright-cli。

---

## 文件职责

- `src/ble/op-case.ts`：新增 `switchOpPll(current, plls, random, simulate)`，负责排除原 PLL、选择并校验新案例。
- `scripts/test-op-case.cjs`：纯函数覆盖保留属性、无 PLL 换为有 PLL、无候选与校验失败。
- `src/vue/SeamlessOp/index.ts`：按钮动作、反馈、预测图设置恢复与持久化。
- `src/vue/SeamlessOp/index.html` / `index.css`：按钮与预测图右上角复选框、移动端布局。
- `scripts/verify-op-switch-pll.js`：浏览器回归按钮与折叠持久化。

## 任务一：换 PLL 纯函数

- [x] 在 `scripts/test-op-case.cjs` 引入 `switchOpPll`，对同一 OLL/y/z2 的当前案例断言新目标与旧目标不同、其他字段保持；从 `none` 案例断言目标不是「无 PLL」；只有原 PLL 和空池时断言明确报错；无法通过校验的候选断言报错且原案例不变。
- [x] 运行 `PATH=/home/andnnl/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:op`；新增断言失败，提示 `switchOpPll is not a function`。
- [x] 在 `src/ble/op-case.ts` 实现 `switchOpPll(current: OpCase, plls: OpItem[], random: () => number, simulate: OpSimulator): OpCase`：筛选 `PLL-` 目标不等于当前 `targetPll`，空池抛「没有可更换的 PLL」；从随机起点遍历候选，逐个调用 `validateOpCase(pll, {name: current.ollName, origin: current.ollFormula}, current.y, simulate, current.z2)`，都失败则抛异常，不修改当前案例。
- [x] 再运行 `npm run test:op` 确认通过；纯函数和测试已提交为 `da39596`。

## 任务二：页面行为

- [x] 在 `scripts/verify-op-switch-pll.js` 写浏览器脚本：进入 `?mode=seamlessop`，检查两个按钮相邻；设置不含 PLL 后换 PLL，断言目标有 PLL、OLL/y/z2 不变、题面更新且 `step===0`；勾选预测图「隐藏」后断言预测贴纸消失，刷新仍隐藏，再取消勾选恢复。
- [x] 在 `src/vue/SeamlessOp/index.html` 新按钮紧贴「重试同题」；预测面板使用 `<header>` 包含标题和带 `aria-label="隐藏预测结果"` 的复选框，展开图用 `v-if="!settings.hidePrediction"`。
- [x] 在 `src/vue/SeamlessOp/index.ts` 的 `Settings/defaults/mounted` 加 `hidePrediction`，`@change="saveSettings"`；新增 `switchPllAndRetry()` 读取已选 PLL 池，调用纯函数后 `training.replace(next)`、清除 feedback、`loadCase()`，失败则显示错误。界面播放或只读复盘状态交给 `replace/loadCase` 恢复。
- [x] 用已有本地 `http://127.0.0.1:18082` 浏览器会话运行脚本，先红灯后绿灯；运行 `npm run test:op`、`NODE_OPTIONS=--openssl-legacy-provider npm run build`、`git diff --check`。构建后检查 `dist/index.html` 和 hash bundle 更新，再按项目习惯提交页面和构建资源。
