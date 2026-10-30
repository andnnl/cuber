# 公式集训练计时实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。本项目明确要求在当前工作区内联执行，不使用 worktree 或子代理。

**目标：** 增加 F2L／OLL／PLL 蓝牙公式训练页，首转起表，停转 1 秒判失败，支持选公式、慢公式复练和成绩记录。

**架构：** 将公式池、判定计时、记录持久化分为独立的纯逻辑单元，页面负责 3D 动画与交互，AppShell 只负责转发全局会话事件。实体与画面状态不强制同步，成功只读实体 FACELETS。

**技术栈：** TypeScript 4.3、Vue 2 类组件、Three.js、webpack 5、Node assert 测试。

**规格：** `docs/superpowers/specs/2026-10-31-formula-timer-training-design.md`。

---

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `src/ble/formula-timer.ts` | 类型、完成条件、轮次计时状态机和慢公式统计 |
| `src/ble/formula-timer-store.ts` | 独立版本化配置与成绩本机存储 |
| `src/vue/FormulaTimer/formulas.ts` | 适配已有公式库、解析逆公式、验证和生成题面 |
| `src/vue/FormulaTimer/index.ts` | 页面逻辑、蓝牙事件与 3D 动画、弹窗交互 |
| `src/vue/FormulaTimer/index.html` | 训练优先布局与选择弹窗 |
| `src/vue/FormulaTimer/index.css` | 手机、桌面响应式布局 |
| `src/vue/AppShell/index.ts` | 注册视图，转发实时 MOVE、FACELETS、连接状态 |
| `src/ble/app-route.ts`、`src/vue/Setting/index.html`、`src/vue/background-store.ts` | 新 mode 路由、主菜单入口和背景色范围 |
| `scripts/test-formula-timer.cjs`、`scripts/test-formula-timer-store.cjs` | 纯逻辑回归测试 |
| `scripts/verify-formula-timer.js` | 浏览器布局、选公式、动画与重置交互验证 |

## 任务 1：纯判定与慢公式统计

**文件：** 创建 `src/ble/formula-timer.ts`、`scripts/test-formula-timer.cjs`。

- [x] **步骤 1：先写失败的断言。** 使用 `.tmp/ble/formula-timer.js`，对还原串、仅 OLL 完成串、未完成串验证 `isFormulaGoal(category, facelets)`；用假时钟与假调度器验证首转起表、`1000 ms` 停转、MOVE 续时、仅结算一次、断连中断、旧轮次结果丢弃。中位数断言：`[1000, 8000, 1100, 1200, 1300, 9000]` 取最近 5 个成功值，得 `1300 ms`；失败不计入。
- [x] **步骤 2：确认失败。** 运行 `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer.cjs`；预期缺少模块或断言失败。
- [x] **步骤 3：实现最小公共接口。**

```ts
export type FormulaCategory = 'f2l' | 'oll' | 'pll';
export type FormulaResult = 'success' | 'idle-failure' | 'interrupted';
export interface FormulaCase { id: string; category: FormulaCategory; name: string; formula: string; initialFacelets: string }
export interface FormulaRecord extends FormulaCase { at: number; durationMs: number; result: FormulaResult }
export function isFormulaGoal(category: FormulaCategory, facelets: string): boolean;
export function recentMedian(records: FormulaRecord[], category: FormulaCategory, id: string): number | null;
export class FormulaTimer {
  beginCase(item: FormulaCase): number;
  move(at: number, serial?: number, recovered?: boolean): boolean;
  facelets(value: string, at: number, serial?: number): boolean;
  interrupt(at: number): void;
  cancel(): void;
  dispose(): void;
}
```

  `FormulaTimer` 注入 `now`、`setTimeout`、`clearTimeout` 和 `requestFacelets`，使用轮次代号及 MOVE 序号门控旧帧。首转前忽略已完成快照；停转边界先请求最新 FACELETS，新 MOVE 可取消结算；请求失败进入中断而非失败。
- [x] **步骤 4：验证通过。** 运行相同命令，预期全部断言通过；`npm run test:pll` 和 `npm run test:op` 仍通过。
- [ ] **步骤 5：仅提交本任务文件。** `git add src/ble/formula-timer.ts scripts/test-formula-timer.cjs && git commit -m "feat(公式训练): 添加蓝牙计时判定状态机"`。

## 任务 2：版本化设置与成绩存储

**文件：** 创建 `src/ble/formula-timer-store.ts`、`scripts/test-formula-timer-store.cjs`。

- [ ] **步骤 1：写失败测试。** 用内存 Storage 验证默认值、三类独立选择、随机／重复、阈值 3 秒、慢公式开关、历史保留、坏 JSON 回退和写失败提示；不得触碰既有 `algs`、`pll6Records` 等键。
- [ ] **步骤 2：确认失败。** 运行 `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer-store.cjs`，预期缺少模块。
- [ ] **步骤 3：实现接口。**

```ts
export interface FormulaTimerSettings {
  category: FormulaCategory; selectedIds: Record<FormulaCategory, string[]>;
  nextMode: 'repeat' | 'random'; slowOnly: boolean; slowSeconds: number;
}
export class FormulaTimerStore {
  load(): { settings: FormulaTimerSettings; records: FormulaRecord[]; warning: string };
  save(settings: FormulaTimerSettings, records: FormulaRecord[]): string | null;
}
```

  使用独立的版本化 localStorage 键；加载时校验类型与范围，坏数据退回默认并显示 warning；保存返回错误供界面显示，不能吞掉错误。
- [ ] **步骤 4：运行测试通过。** 同步骤 2，另外运行 `npm run test:ble`。
- [ ] **步骤 5：提交。** `git add src/ble/formula-timer-store.ts scripts/test-formula-timer-store.cjs && git commit -m "feat(公式训练): 保存筛选设置与成绩"`。

## 任务 3：复用现有公式并生成题面

**文件：** 创建 `src/ble/formula-timer-formula.ts`、`src/vue/FormulaTimer/formulas.ts`、`scripts/test-formula-timer-formulas.cjs`。纯解析逻辑放前者，交互与公式库读取放后者。

- [ ] **步骤 1：编写失败测试。** 分别取 `src/vue/Algs/algs.json` 的 F2L／OLL／PLL 内置条目以及自定义 OLL 条目，校验括号、重复次数、宽转／整体转体的逆序；不合法公式明确报错，题面不能是还原态；原公式作用于题面应回到目标状态。
- [ ] **步骤 2：确认失败。** 运行 `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer-formulas.cjs`，预期缺少案例生成接口。
- [ ] **步骤 3：实现适配。**

```ts
export interface FormulaItem { id: string; category: FormulaCategory; name: string; formula: string }
export function buildFormulaPool(groups: AlgGroup[], customOlls: OpItem[]): FormulaItem[];
export function makeFormulaCase(item: FormulaItem): FormulaCase;
```

  读取用户在公式库修改的 `exp`，OLL 自定义源复用 `loadCustomOllLibrary`。生成失败返回可见错误，不进入随机池，避免在计时路径频繁模拟。
- [ ] **步骤 4：运行测试通过，并运行 `npm run verify`。**
- [ ] **步骤 5：提交。** `git add src/vue/FormulaTimer/formulas.ts src/ble/formula-timer-formula.ts scripts/test-formula-timer-formulas.cjs && git commit -m "feat(公式训练): 从公式库生成有效题面"`。

## 任务 4：页面、选择弹窗、记录与慢公式筛选

**文件：** 创建 `src/vue/FormulaTimer/index.ts`、`index.html`、`index.css`、`scripts/verify-formula-timer.js`；修改 `src/ble/app-route.ts`、`src/vue/Setting/index.html`、`src/vue/background-store.ts` 和 `src/vue/AppShell/index.ts` 的视图注册。

- [ ] **步骤 1：先写浏览器失败验证。** 启动 `npm run watch`；脚本打开 `?mode=formulatimer`，断言页面显示 3D、当前类别、公式和大号计时器，选择弹窗支持类别、分组、全选／取消、鼠标拖动、手机长按滑选；保存设置后刷新仍保留；记录恢复起始题面。
- [ ] **步骤 2：运行脚本确认缺页面。** `playwright-cli run-code --filename scripts/verify-formula-timer.js`，预期失败于训练页不存在。
- [ ] **步骤 3：注册路由、菜单、背景范围并实现 Vue 页面。** 参考 `src/vue/SeamlessOp/index.html` 的选择弹窗与 `src/vue/PllObservation/index.ts` 的 `World`、`viewport`、动画生命周期，保持组件职责仅为展示和输入。

```ts
handlePhysicalEvent(event: LinkEvent, live: boolean): void {
  if (event.type === 'move' && live && !event.recovered) {
    this.timer.move(Date.now(), event.serial);
    this.world.cube.twister.push(event.move);
  } else if (event.type === 'facelets') this.timer.facelets(event.facelets, Date.now(), event.serial);
}
```

  换题时 `twister.finish()`、重置为新题面，再清除本页轮次账本；仅练慢公式且池为空时页面停在明确提示。记录和配置调用任务 2 的 Store。
- [ ] **步骤 4：运行浏览器脚本与生产构建。** `playwright-cli run-code --filename scripts/verify-formula-timer.js` 和 `npm run build`，预期通过；手机视口检查滚动和弹窗可操作。
- [ ] **步骤 5：提交。** `git add src/vue/FormulaTimer scripts/verify-formula-timer.js src/vue/AppShell/index.ts src/ble/app-route.ts src/vue/Setting/index.html src/vue/background-store.ts && git commit -m "feat(公式训练): 添加移动端计时与公式筛选界面"`。

## 任务 5：全局蓝牙事件与菜单路由

**文件：** 修改 `src/vue/AppShell/index.ts`、`src/vue/FormulaTimer/index.ts`、`scripts/verify-formula-timer.js`。

- [ ] **步骤 1：先扩展失败验证。** 从菜单进入新页，用 Mock BLE 注入首次实时 MOVE、重复 MOVE、FACELETS、断连和换题后的迟到旧事件；断言计时和 3D 跟转、不同步时按实体状态结算、重复／随机策略不误复用旧帧。
- [ ] **步骤 2：运行失败验证。** 预期页面可以打开，但蓝牙事件不会启动计时或跟转。
- [ ] **步骤 3：接线。** AppShell 的 snapshot 推送给该模式；`dispatch` 将 MOVE 的 `gate.accept(mode,event)` 与 FACELETS 一并送给组件。判题不受“跟随实体魔方”开关控制；关闭开关只停 3D 动画。
- [ ] **步骤 4：运行 `npm run test:ble`、`npm run test:pll`、`npm run test:op`、浏览器脚本和 `npm run build`，预期通过。**
- [ ] **步骤 5：提交。** `git add src/vue/AppShell/index.ts src/vue/FormulaTimer/index.ts scripts/verify-formula-timer.js && git commit -m "feat(公式训练): 接入全局蓝牙事件"`。

## 任务 6：验收与清理

- [ ] 核查规格的每一项：题面与实体不要求同步、首转起表、OLL 特殊目标、停转 1 秒、自动下一题、轮次清理、慢公式无样本和空池、异常断连；必要时补测试而非只补注释。
- [ ] `git diff --check`；运行 `npm run test:ble && npm run test:pll && npm run test:op && npm run verify && npm run build`。对无法在 CI 模拟的真实蓝牙设备验证，明确在交接中告知用户需要本机手测。
- [ ] `git status --short`，只保留用户原有未跟踪文件；不删除 `.superpowers/`、`.trae/` 或历史计划。

## 规格自检映射

- 公式来源／有效题面 → 任务 3；布局／多选 → 任务 4；路由／共享连接 → 任务 5。
- 成功／停转／中断／隔轮事件 → 任务 1、4、5；本机记录／慢公式 → 任务 1、2、4。
- 测试与错误提示 → 各任务的失败测试、通过验证及任务 6 验收。
