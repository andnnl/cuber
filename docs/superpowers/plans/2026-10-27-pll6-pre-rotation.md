# PLL 六格案例前转体实现计划

> **面向 AI 代理的工作者：** 在主工作区内联执行；用户明确不使用 worktree。测试先行，保留其他未提交改动。

**目标：** 案例顺序改为随机 `无/y/y'/y2` → PLL 逆公式 → 随机 `无/U/U'/U2`，同步页面说明和核验。

**架构：** 保留现有 `PllTraining` 注入的随机数与公式逆序逻辑，只分开前整体转体与后 U 层 AUF。浏览器用真实公式和 3D 引擎验证全部 336 种组合仍可识别原 PLL 名称。

**技术栈：** TypeScript、Node assert、Playwright CLI、webpack。

---

### 任务 1：案例生成

**文件：** `scripts/test-pll-training.cjs`、`src/ble/pll-training.ts`

- [x] 测试预期 `preRotation === 'y'` 且公式为 `y R U'`；逐个验证四种前转体的取值和后 AUF 保持原值，运行 `npm run test:pll` 看红灯。
- [x] 把 `PllCase.preAuf` 更名为 `preRotation`，增加 `ROTATIONS = ['', 'y', "y'", 'y2']`，在 `next()` 第一随机位选整体转体，保留后 AUF；重跑测试变绿。

### 任务 2：说明和真实状态

**文件：** `src/vue/PllObservation/index.html`、`scripts/verify-pll6-computed.js`、`docs/pll-six-sticker-observation.md`

- [x] 页面与资料准确写明前整体转体和后 AUF。
- [x] 浏览器用前 `['', 'y', "y'", 'y2']`、后 `['', 'U', 'U2', "U'"]` 穷举 336 个状态，断言识别的 PLL 名称不变。
- [x] 运行 `npm run test:pll`、`npm run test:ble`、`npm run build`、浏览器核验和 `git diff --check`；不提交或推送其他工作区改动。
