// BleCrossTrainer 面板主题样式 (与 CrossF2LTrainer 风格保持一致)
// 注意: 组件模板中的 <style> 标签会被 vue-template-compiler 剥离 (从未生效),
// 本样式由组件 mounted 钩子注入 document.head

export const BLE_THEME_CSS = `
/* ===== 面板卡片: 白卡 + 柔和分层阴影 ===== */
.ble-card {
  background: #ffffff !important;
  box-shadow: 0 4px 24px rgba(60, 72, 100, 0.14), 0 1px 4px rgba(60, 72, 100, 0.10) !important;
}
/* 通用小按钮: 浅灰底 + 细边框 */
.ble-card .v-btn.x-small {
  background: #f4f6fa !important;
  color: #455a64 !important;
  border: 1px solid #e3e8f0;
  box-shadow: none !important;
  padding: 0 8px !important;
  transition: background 0.15s, border-color 0.15s;
}
.ble-card .v-btn.x-small:hover {
  background: #eaeef6 !important;
  border-color: #d4dbe8;
}
/* 主按钮: 靛蓝->紫渐变 */
.ble-card .v-btn.primary {
  background: linear-gradient(135deg, #5b6bf0, #7c4dff) !important;
  color: #fff !important;
  border: none;
  box-shadow: 0 2px 8px rgba(91, 107, 240, 0.4) !important;
}
/* 打乱公式: 等宽字体, 窄屏自动换行 */
.ble-card .scramble-text {
  font-family: 'Roboto Mono', Consolas, monospace;
  font-size: 13px;
  color: #333;
  background: #f4f6fa;
  border-radius: 6px;
  padding: 3px 8px;
  line-height: 1.5;
  word-break: break-all;
  min-width: 0;
}
.ble-card .scramble-text.muted {
  color: #9aa3b2;
  background: #f8f9fc;
}
/* 连接状态点: 灰未连/蓝连接中/绿已连 */
.ble-card .status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
  display: inline-block;
}
.ble-card .status-dot.dot-disconnected {
  background: #c2c9d4;
}
.ble-card .status-dot.dot-connecting {
  background: #5b6bf0;
  animation: ble-dot-pulse 1s ease-in-out infinite;
}
.ble-card .status-dot.dot-connected {
  background: #26c281;
}
@keyframes ble-dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
/* 成功文案 */
.ble-card .ok-text {
  color: #1b9e5a;
  font-weight: bold;
}
/* 帮助弹窗 */
.help-dialog {
  background: #ffffff !important;
  border-radius: 12px !important;
}
.help-dialog .help-title {
  background: linear-gradient(120deg, #5b6bf0, #9c27b0);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: bold;
  font-size: 17px;
  padding-bottom: 4px;
}
.help-dialog .help-body {
  color: #444;
}
`;
