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
/* 打乱操作与输入: 对齐 CrossF2L, 窄屏按控件整体换行 */
.ble-card .ble-scramble-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  flex-wrap: wrap;
  row-gap: 4px;
}
.ble-card .ble-scramble-input-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
}
.ble-card .ble-scramble-input-row .v-text-field {
  flex: 1;
  min-width: 0;
  padding: 0;
  margin: 0;
}
.ble-card .v-text-field .v-input__control .v-input__slot {
  background: #f4f6fa !important;
  border: 1px solid #e3e8f0 !important;
  border-radius: 6px !important;
}
.ble-card .v-text-field fieldset {
  border: none !important;
}
.ble-scramble-formula {
  font-family: 'Roboto Mono', Consolas, monospace;
  font-size: 15px;
  color: #333;
  background: #f4f6fa;
  border-radius: 6px;
  padding: 8px 10px;
  line-height: 1.7;
  word-break: break-all;
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
/* BLE Cross 专用 3D 背景选择器 */
.ble-bg-trigger {
  height: 22px;
  min-width: 42px;
  padding: 2px 5px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  border: 1px solid #d8e0ec;
  border-radius: 5px;
  background: #f8fafc;
  color: #596579;
  cursor: pointer;
}
.ble-bg-current {
  width: 22px;
  height: 14px;
  display: inline-block;
  border: 1px solid rgba(45, 55, 72, 0.35);
  border-radius: 3px;
}
.ble-bg-menu {
  width: 174px;
  padding: 9px;
  border-radius: 8px !important;
}
.ble-bg-grid {
  display: grid;
  grid-template-columns: repeat(5, 24px);
  gap: 7px;
  justify-content: center;
}
.ble-bg-swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(45, 55, 72, 0.35);
  border-radius: 5px;
  cursor: pointer;
  box-sizing: border-box;
}
.ble-bg-swatch.selected {
  outline: 2px solid #5b6bf0;
  outline-offset: 2px;
}
.ble-bg-custom {
  margin-top: 10px;
  height: 28px;
  padding: 0 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #d8e0ec;
  border-radius: 5px;
  color: #455a64;
  font-size: 12px;
  cursor: pointer;
}
.ble-bg-custom input[type='color'] {
  width: 36px;
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.ble-visual-options {
  min-width: 0;
  flex-wrap: nowrap;
}
.ble-difficulty-select {
  flex: none;
  height: 22px;
  min-width: 48px;
  border: 1px solid #e3e8f0;
  border-radius: 4px;
  background: #fff;
  color: #333;
  padding: 0 2px;
  font-size: 12px;
  white-space: nowrap;
}
@media (max-width: 420px) {
  .ble-visual-options {
    gap: 5px !important;
  }
  .ble-difficulty-select {
    min-width: 44px;
    max-width: 54px;
  }
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
/* ===== 训练记录弹窗 ===== */
.rec-dialog .rec-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.rec-dialog .rec-stat-label {
  font-size: 12px;
  color: #6b7688;
}
.rec-dialog .rec-select {
  font-size: 12px;
  padding: 3px 6px;
  border: 1px solid #d8e0ec;
  border-radius: 6px;
  background: #f8fafc;
  color: #455a64;
  outline: none;
}
.rec-dialog .rec-stats {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.rec-dialog .rec-stat {
  flex: 1;
  text-align: center;
  background: #f4f6fa;
  border: 1px solid #e3e8f0;
  border-radius: 8px;
  padding: 6px 2px;
}
.rec-dialog .rec-stat-v {
  font-size: 14px;
  font-weight: bold;
  color: #3b4a63;
}
.rec-dialog .rec-stat-k {
  font-size: 11px;
  color: #8a94a6;
  margin-top: 2px;
}
.rec-dialog .rec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.rec-dialog .rec-table th,
.rec-dialog .rec-table td {
  border-bottom: 1px solid #eef1f6;
  padding: 4px 4px;
  text-align: center;
  color: #45515f;
}
.rec-dialog .rec-table th {
  color: #8a94a6;
  font-weight: 600;
  background: #f8fafc;
  position: sticky;
  top: 0;
}
.rec-dialog .rec-table tbody tr:hover {
  background: #f6f8fc;
}
.rec-dialog .rec-table .rec-nowrap {
  white-space: nowrap;
}
.rec-dialog .rec-table .rec-difficulty {
  white-space: nowrap;
}
.rec-dialog .rec-table .rec-ok {
  color: #26c281;
  font-weight: bold;
}
.rec-dialog .rec-table .rec-bad {
  color: #e05252;
  font-weight: bold;
}
.rec-dialog .rec-table tr.rec-fail td {
  color: #9aa3b2;
}
.rec-dialog .rec-table tr.rec-fail td.rec-ok,
.rec-dialog .rec-table tr.rec-fail td.rec-bad {
  color: inherit;
}
`;
