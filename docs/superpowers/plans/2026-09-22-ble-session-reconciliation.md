# BLE 会话与轮次对账加固实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复 BLE Cross 的旧基线回退、重连首包错位、旧会话回调污染和批量恢复动作漏步问题。

**架构：** `CubeLink` 用连接 generation 隔离会话；BLE Cross 用首包标记和单调序号约束训练状态，轮次边界暂存来源不确定的 MOVE，再由 FACELETS 对账；Android 桥按 `BluetoothGatt` 实例过滤迟到回调。3D 权威重绘统一保留完整视角链。

**技术栈：** TypeScript、Vue 2、GAN BLE 协议、Playwright CLI、Android Java、Gradle。

---

## 文件职责

- `src/ble/cube-link.ts`：连接 generation、当前会话事件过滤和资源清理。
- `src/ble/protocols/gan.ts`：终止旧协议实例的通知派发。
- `src/ble/transport/native.ts`：原生连接阶段校验、超时/失败清理。
- `android/app/src/main/java/com/cuber/trainer/BleBridge.java`：按 GATT 实例隔离 Android 异步回调。
- `src/vue/BleCrossTrainer/index.ts`：首包强制同步、轮次 MOVE 缓冲、单调序号对账和完整视角自愈。
- `scripts/test-ble.js`：连接会话、GAN 批量来源和协议层回归。
- `scripts/verify-blecross-recompute.js`：训练页事件时序和 3D 状态回归。

### 任务 1：锁定训练页失败时序

**文件：**
- 修改：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：添加旧基线不得回退两步实时状态的测试**

在现有 `firstMoveRace` 场景中加入 `MOVE R/121`、`MOVE U/122`、`FACELETS afterR/121`，等待基线恢复计时器后断言：

```js
multiMoveBeforeOldBaseline.predicted === afterRU
multiMoveBeforeOldBaseline.scene === afterRU
multiMoveBeforeOldBaseline.eventSerial === 122
multiMoveBeforeOldBaseline.moves === 2
```

- [ ] **步骤 2：添加新连接首包强制同步测试**

先让 `predicted` 和 3D 保持旧会话状态，再模拟 `connecting` 阶段收到不同 FACELETS，随后模拟 `connected/ready` 后再次收到同一帧，断言最终 `predicted` 与 3D 都等于新实体状态。

- [ ] **步骤 3：添加完整视角自愈测试**

执行 `y` 和 `z2` 后制造权威状态漂移，将 `lastBleMoveAt` 设为静止阈值之前，触发普通 FACELETS 自愈，断言核心状态、当前视角签名和公式换名在自愈前后保持一致。

- [ ] **步骤 4：运行浏览器回归并确认红灯**

运行：

```bash
npm run verify:blecross
```

预期：旧基线场景或重连首包场景失败，错误信息包含具体状态差异。

### 任务 2：实现训练页单调对账

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 修改：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：新增会话首包和轮次缓冲状态**

新增字段：

```ts
private bleSessionBaselinePending = false;
private bleRoundMoves: LinkMoveEvent[] = [];
private bleRoundStartSerial: number | null = null;
```

其中 `LinkMoveEvent` 使用从 `LinkEvent` 提取的 MOVE 类型，保存 `move`、`serial`、`recovered`。

- [ ] **步骤 2：连接开始时清空旧实体推演并等待首包**

`onLinkStatus("connecting")` 清空序号、`predicted`、首包状态和轮次缓冲；`connected` 后保持 `bleSessionBaselinePending=true`。本会话首个合法 FACELETS 使用统一权威同步函数强制重绘 3D，然后再开轮。

- [ ] **步骤 3：阻止轮次基线序号回退**

FACELETS 作为 round baseline 时先比较 `e.serial` 与当前 `bleEventSerial`：

```ts
const staleAgainstLive =
  e.serial !== undefined &&
  this.bleEventSerial !== null &&
  this.serialRelation(e.serial & 0xff, this.bleEventSerial) < 0;
```

若为旧基线，结束本次等待但不修改 `predicted`、3D 和事件序号，并再次请求 FACELETS。

- [ ] **步骤 4：轮次同步期间缓冲 recovered MOVE**

实时 MOVE 继续立即播放；`recovered` MOVE 先进入 `bleRoundMoves`。基线到达后，根据序号范围和 `applyFaceletMove` 结果过滤已包含前缀，只将明确位于基线之后的后缀交给 `onMoveEvent`。无法对账时清空缓冲并以权威状态同步，不重复计步。

- [ ] **步骤 5：统一普通权威自愈路径**

将 `onAuthoritative` 中的 `syncScene(raw)` + `applyZ2Flip()` 改为 `syncPhysicalScene(raw, "auth")`，保留 `effectiveViewOps()` 和 history，不再清空 `observedOps`。

- [ ] **步骤 6：运行浏览器回归确认绿灯**

运行：

```bash
npm run verify:blecross
```

预期：所有 BLE Cross 回归通过。

- [ ] **步骤 7：提交训练页修复**

```bash
git add src/vue/BleCrossTrainer/index.ts scripts/verify-blecross-recompute.js
git commit -m "fix(蓝牙训练): 加固轮次与重连状态对账"
```

### 任务 3：隔离连接会话

**文件：**
- 修改：`src/ble/cube-link.ts`
- 修改：`src/ble/protocols/gan.ts`
- 修改：`scripts/test-ble.js`

- [ ] **步骤 1：添加旧会话回调测试**

用可控 Mock transport 连续建立会话 A、B。B 连接成功后触发 A 的事件和断开回调，断言：

```js
cubeLink.status === "connected"
receivedEvents 不包含 A 的迟到事件
cubeLink.deviceInfo 指向 B
```

- [ ] **步骤 2：运行 BLE 测试确认红灯**

```bash
npm run test:ble
```

预期：旧会话断开使当前状态变成 `disconnected`，测试失败。

- [ ] **步骤 3：实现 generation 守卫**

`CubeLink.connect()` 每次递增 generation，并捕获局部 `transport`、`gan` 和 generation：

```ts
if (generation !== this.generation || this.gan !== gan) return;
```

事件、断开和连接完成均使用该守卫。主动断开先使 generation 失效，再清空当前引用并断开局部实例。

- [ ] **步骤 4：连接失败时释放传输层**

catch 中对局部 `gan` 执行一次安全断开，只有当前 generation 才发布 `disconnected`。`GanCubeLink` 增加关闭标记，关闭后不再接收通知或派发事件。

- [ ] **步骤 5：运行 BLE 测试确认绿灯**

```bash
npm run test:ble
```

预期：协议测试及新会话隔离测试全部通过。

- [ ] **步骤 6：提交连接层修复**

```bash
git add src/ble/cube-link.ts src/ble/protocols/gan.ts scripts/test-ble.js
git commit -m "fix(蓝牙连接): 隔离迟到会话回调"
```

### 任务 4：隔离 Android GATT 生命周期

**文件：**
- 修改：`src/ble/transport/native.ts`
- 修改：`android/app/src/main/java/com/cuber/trainer/BleBridge.java`

- [ ] **步骤 1：为所有 Android GATT 回调增加实例校验**

`onConnectionStateChange` 中旧实例断开时只执行 `g.close()`；其余服务、描述符、写入和通知回调开头统一检查：

```java
if (g != gatt) {
    return;
}
```

- [ ] **步骤 2：让辅助方法使用明确 GATT 实例**

通知订阅与关闭逻辑不得通过旧回调操作新的全局 `gatt`。新增 `closeGatt(BluetoothGatt target)`，仅当 `target == gatt` 时清空全局队列与字段。

- [ ] **步骤 3：清理 JS 原生连接失败状态**

`NativeBridgeTransport.failConnect()` 调用 `bridge.disconnect()`，将 `connected=false`、`commandChar=""`，并使迟到 `services` 在无 `connectResolve` 时直接忽略。`notify` 仅在 `connected` 时派发。

- [ ] **步骤 4：编译 Android Java**

运行：

```bash
cd android
./gradlew :app:compileDebugJavaWithJavac
```

预期：Gradle 退出码为 0。

- [ ] **步骤 5：提交 Android 修复**

```bash
git add src/ble/transport/native.ts android/app/src/main/java/com/cuber/trainer/BleBridge.java
git commit -m "fix(蓝牙连接): 隔离 Android GATT 迟到回调"
```

### 任务 5：恢复覆盖并完成验证

**文件：**
- 修改：`scripts/test-ble.js`
- 修改：`scripts/verify-blecross-recompute.js`
- 生成：`dist/index.html`
- 生成：`dist/index.*.js`
- 生成：`dist/vendor.*.js`（仅内容哈希变化时）

- [ ] **步骤 1：补回序号回绕和旧帧测试**

恢复 `255→0`、已消费同序号重复 MOVE、普通旧 FACELETS 不回拉状态的断言，避免近期回归脚本替换时丢失覆盖。

- [ ] **步骤 2：运行全部验证**

```bash
npm run test:ble
npm run verify:blecross
cd android && ./gradlew :app:compileDebugJavaWithJavac
```

预期：所有命令退出码为 0。

- [ ] **步骤 3：生产构建并恢复查表文件**

```bash
npm run build
node scripts/gen-table.mjs
stat -c '%n %s bytes' dist/cube_cross_table.bin
```

预期：生产构建成功，查表文件大小为 `2661132 bytes`。

- [ ] **步骤 4：检查差异范围**

```bash
git diff --check -- src/ble src/vue/BleCrossTrainer/index.ts scripts android/app/src/main/java/com/cuber/trainer/BleBridge.java dist
git status -sb
```

预期：不暂存 `README.md`、`.trae/` 和 `dist/cube_cross_table.bin`。

- [ ] **步骤 5：提交构建产物**

仅暂存 `dist/index.html`、新旧 `dist/index.*.js`，以及 HTML 实际引用且哈希变化的 vendor 文件：

```bash
git commit -m "build(蓝牙训练): 更新会话对账修复产物"
```

- [ ] **步骤 6：推送并确认同步**

```bash
git push origin master
git status -sb
```

预期：`master...origin/master` 无领先提交；工作区只保留用户文件和未跟踪查表文件。
