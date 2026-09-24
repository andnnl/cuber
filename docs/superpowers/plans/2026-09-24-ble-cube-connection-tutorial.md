# 蓝牙魔方连接教程实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 新增操作步骤优先的蓝牙魔方连接教程，并从 BLE Cross 使用说明提供入口。

**架构：** 在现有 `mode` 分发中注册一个独立 Vue 2 类组件。教程使用静态内容和响应式 CSS，不接触训练状态；BLE Cross 通过普通链接进入教程，教程通过普通链接返回训练页。

**技术栈：** TypeScript、Vue 2、Vuetify、CSS、Playwright CLI、webpack 5

---

## 文件结构

- 创建 `src/vue/BleConnectTutorial/index.ts`：教程 Vue 组件入口。
- 创建 `src/vue/BleConnectTutorial/index.html`：教程内容与导航。
- 创建 `src/vue/BleConnectTutorial/index.css`：独立页面响应式样式。
- 修改 `src/index.ts`：注册 `bleconnect` 模式。
- 修改 `src/vue/BleCrossTrainer/index.html`：在使用说明中增加教程入口。
- 创建 `scripts/verify-bleconnect.js`：验证路由、文案、导航和移动端布局。
- 修改 `package.json`：增加教程页验证命令。

### 任务 1：建立教程行为测试

- [x] **步骤 1：编写失败的浏览器验证**

创建 `scripts/verify-bleconnect.js`，访问 `?mode=bleconnect` 并断言：

```javascript
await page.goto("http://127.0.0.1:8080/?mode=bleconnect");
const tutorial = document.querySelector("[data-ble-connect-tutorial]");
if (!tutorial) throw new Error("蓝牙连接教程未渲染");
```

同时检查 BLE Cross 帮助弹窗中的教程链接、教程返回链接、关键内容，以及 360 px 视口无横向溢出。

- [x] **步骤 2：运行测试并确认红灯**

运行：`npm run verify:bleconnect`

预期：FAIL，提示蓝牙连接教程未渲染或教程入口不存在。

### 任务 2：实现独立教程页和帮助入口

- [x] **步骤 1：实现最少页面组件**

创建组件并在 `src/index.ts` 注册：

```typescript
@Component({
  template: require("./index.html"),
})
export default class BleConnectTutorial extends Vue {}
```

- [x] **步骤 2：实现经过校正的教程内容**

内容按「三步连接 → 失败排查 → MAC 兜底 → 兼容性」组织，明确 MAC 并非普通连接必填项，浏览器内部页不保证暴露真实地址，iOS 无法从网页获取真实 MAC。

- [x] **步骤 3：增加双向导航**

在 BLE Cross 使用说明增加：

```html
<v-btn href="?mode=bleconnect" data-ble-connect-help-link>蓝牙连接教程</v-btn>
```

教程页用 `href="?mode=blecross"` 返回训练。

- [x] **步骤 4：实现移动端布局**

在 640 px 以下将步骤、排查项和兼容性表格切换为单列卡片，设置 `min-width: 0` 和文本换行规则，确保 360 px 无横向溢出。

- [x] **步骤 5：运行教程验证并确认绿灯**

运行：`npm run verify:bleconnect`

预期：PASS，输出教程页验证通过。

### 任务 3：回归验证、构建与交付

- [x] **步骤 1：运行 BLE 单元测试**

运行：`npm run test:ble`

预期：所有 BLE 测试通过，无失败。

- [x] **步骤 2：运行 BLE Cross 页面回归**

运行：`npm run verify:blecross`

预期：页面验证通过，无异常。

- [x] **步骤 3：执行生产构建**

先备份未跟踪的 `dist/cube_cross_table.bin`，运行 `npm run build`，再恢复并核对 SHA-256 为 `93455c0e1994692f153c7631bef9a9dc1f68b648a8fe5a378eafd7a9e180f7c5`。

- [x] **步骤 4：检查提交范围**

运行：`git diff --check` 和 `git status --short`，确保不提交用户已有的 `README.md`、`.superpowers/`、`.trae/` 与 `dist/cube_cross_table.bin`。

- [ ] **步骤 5：提交并推送**

提交信息：

```text
feat(蓝牙教程): 添加魔方连接与 MAC 排查指南
```

推送 `master` 到 `origin` 和 `github`。

## 自检

- 规格中的页面、入口、返回导航、内容口径、移动端布局和测试均有对应任务。
- 计划没有使用「待定」「TODO」「类似任务」等占位表达。
- 路由名称、选择器和文件路径在各任务中保持一致。
