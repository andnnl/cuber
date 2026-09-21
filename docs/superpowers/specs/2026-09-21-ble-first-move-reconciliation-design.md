# BLE 首次转动状态对账设计

## 背景

BLE Cross 同时消费两类状态源：GAN `MOVE` 事件用于低延迟动画和计步，`FACELETS` 事件用于权威状态校正。连接、重置或打乱预览后，首个 `MOVE` 还会通过 `previewPending` 把 3D 从预览态切换到实体轨道。

当前上层 `LinkEvent` 丢弃了 GAN 事件序号。若真机先上报已经包含本次转动的 `FACELETS`，随后才到同一序号的 `MOVE`，训练页会在权威状态上再次应用该步，造成双转。迟到的旧 `FACELETS` 也可能把已经推演正确的 3D 回拉。现有 Mock 固定按 `MOVE → FACELETS` 派发，未覆盖这些时序。

## 目标

- `MOVE → FACELETS` 和 `FACELETS → MOVE` 都只消费一次物理转动。
- 丢弃比当前已确认序号更旧的权威状态，避免 3D 回拉。
- BLE 通知严格按接收顺序处理，避免异步协议解析重排。
- 重置、打乱预览后的第一步仍以实体状态为准，但不得叠加重复步骤。
- 保持物理记号、屏幕记号、HTM 步数和 Cross/XCross 判定语义不变。

## 方案

### 1. 保留协议序号

为上层 BLE 事件增加可选 `serial`：

- `facelets`: `{ type, facelets, serial? }`
- `move`: `{ type, move, serial? }`

`GanCubeLink.toLinkEvent` 从 `GanCubeEvent` 原样传递序号。可选字段保证其他传输实现和既有调用兼容。

### 2. 串行化通知解析

`GanCubeLink` 为每个收到的通知建立 Promise 队列。后一帧必须等前一帧完成解密、驱动解析和事件派发后再处理。单帧失败只丢弃该帧，不中断后续队列。

### 3. 训练页按序号对账

训练页维护最近权威序号及已经由 FACELETS 覆盖的序号：

- 收到更新或同序号 `FACELETS`：记录权威序号并按需要同步状态。
- 收到更旧 `FACELETS`：忽略，不覆盖 `predicted`、不重绘 3D。
- 收到与最近权威序号相同的 `MOVE`：该步已经包含在权威状态中，不再调用 `applyFaceletMove` 或 `mirrorPush`。
- 收到更新的 `MOVE`：沿用现有推演、显示记号、计步、判定和镜像流程。

序号按 GAN 8 位循环计数比较，正确处理 `255 → 0`。连接、断开和切换输入源时清空对账状态，防止跨连接污染。

当事件不带序号（手工调试或旧调用者）时，保持原有行为。

### 4. 首步预览切换

保留 `previewPending` 的正确性语义：3D 在首个尚未被权威状态覆盖的新 MOVE 到来时，先切到实体转前态再播放一步。如果该 MOVE 已被同序号 FACELETS 覆盖，则直接采用权威场景并清除 `previewPending`，不再额外播放一步。

这可以消除真实的重复转动。预览态与实体态本身差异很大时，画面仍可能发生一次必要的状态切换；该切换不再伴随重复层转。

## 测试

### 协议单元测试

- `toLinkEvent` 保留 FACELETS/MOVE 序号。
- 连续通知即使前一帧解析发生异步等待，派发顺序仍与接收顺序一致。
- 单帧解析失败不阻断下一帧。

### BLE Cross 浏览器回归

- 标准 `MOVE → FACELETS`：状态只前进一步，3D 最终等于 `predicted`。
- 乱序 `FACELETS(after) → MOVE(same serial)`：MOVE 不重复推演、不重复动画。
- 迟到 `FACELETS(before)`：不把已完成 MOVE 的状态回拉。
- 多次 `resetRound` 后首转：计步和显示记录均为 1，3D 等于权威/推演态。
- 覆盖序号回绕 `255 → 0`。

## 非目标

- 不改变 GAN 丢包历史恢复策略。
- 不改变打乱、Cross/XCross 求解或视角记号转换。
- 不通过固定延时等待 FACELETS；避免给实时镜像增加可感知延迟。
