// BleCrossTrainer 面板主题样式 (与 CrossF2LTrainer 风格保持一致)
// 注意: 组件模板中的 <style> 标签会被 vue-template-compiler 剥离 (从未生效),
// 本样式由组件 mounted 钩子注入 document.head

export const BLE_THEME_CSS = `
.ble-fixed-overlay { position:absolute; inset:0; z-index:100; background:#f7f8fc; display:flex; flex-direction:column; color:#273349; touch-action:pan-y; user-select:text; }
.ble-fixed-top { display:flex; align-items:center; gap:10px; flex:none; padding:10px 14px; background:white; box-shadow:0 2px 8px #28345a20; }
.ble-fixed-top span { flex:1; font-size:12px; color:#607086; }
.ble-fixed-overlay button { cursor:pointer; border:1px solid #cbd2e6; border-radius:6px; padding:6px 9px; background:white; color:#273349; touch-action:manipulation; }
.ble-fixed-overlay button.active { color:#3449b8; background:#e9edff; border-color:#778af0; }
.ble-fixed-overlay button:disabled { opacity:.5; cursor:default; }
.ble-fixed-visual-options { display:flex; align-items:center; flex-wrap:wrap; gap:6px 11px; padding:5px 10px; background:white; border-bottom:1px solid #e3e8f0; font-size:12px; }
.ble-fixed-visual-options label { display:inline-flex; align-items:center; gap:3px; white-space:nowrap; cursor:pointer; }
.ble-fixed-visual-options input[type=checkbox] { width:14px; height:14px; }
.ble-fixed-background-options { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.ble-fixed-background-options > span { margin-right:3px; }
.ble-fixed-visual-options .ble-fixed-swatch { width:20px; height:20px; min-width:20px; padding:0; border:1px solid #8c95a4; border-radius:4px; }
.ble-fixed-visual-options .ble-fixed-swatch.active { outline:2px solid #4556d3; outline-offset:1px; }
.ble-fixed-background-options input[type=color] { width:26px; height:24px; padding:0; border:0; background:transparent; cursor:pointer; }
.ble-fixed-body { flex:1; min-height:0; display:grid; grid-template-columns:minmax(240px, 1fr) minmax(300px, 400px); }
.ble-fixed-stage { min-height:0; display:flex; flex-direction:column; align-items:center; padding:8px; }
.ble-fixed-canvas { width:100%; flex:1; min-height:180px; overflow:hidden; touch-action:none; }
.ble-fixed-canvas > div, .ble-fixed-canvas > div > div { width:100%; height:100%; }
.ble-fixed-canvas canvas { display:block; }
.ble-fixed-formula { max-width:100%; text-align:center; font:bold 16px/1.5 monospace; overflow-wrap:anywhere; }
.ble-fixed-formula small { display:block; font:12px sans-serif; color:#66728b; }
.ble-fixed-controls { display:flex; flex-wrap:wrap; justify-content:center; gap:5px; margin:6px 0; }
.ble-fixed-controls button { min-width:34px; min-height:34px; padding:4px; font-size:16px; line-height:1; border-color:#b8c3e1; color:#344577; }
.ble-fixed-hint { text-align:center; font-size:11px; color:#66728b; }
.ble-fixed-grip-routes { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px; margin:6px 0; }
.ble-fixed-grip-routes button { display:flex; flex-direction:column; align-items:flex-start; min-width:0; text-align:left; gap:2px; font-size:12px; }
.ble-fixed-grip-routes button strong { font-size:13px; }
.ble-fixed-grip-routes button small { color:#66728b; font-size:11px; }
.ble-fixed-sidebar { display:flex; flex-direction:column; min-height:0; overflow:hidden; padding:8px; gap:8px; }
.ble-fixed-tabs { display:flex; gap:6px; flex:none; }
.ble-fixed-list { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:5px; overflow:auto; min-height:90px; flex:1; align-content:start; }
.ble-fixed-list button { text-align:left; font:13px/1.4 monospace; overflow-wrap:anywhere; }
.ble-fixed-guide { flex:1; min-height:100px; overflow:auto; background:white; padding:8px; border:1px solid #e0e4ed; border-radius:8px; font-size:13px; line-height:1.6; }
.ble-fixed-guide > b, .ble-fixed-guide > span { display:block; }
.ble-fixed-grip-switch { display:flex; gap:5px; padding:5px 0; }
.ble-fixed-guide > div { padding:3px 6px; }
.ble-fixed-guide > div.active { background:#e9edff; border-radius:4px; }
@media (max-width:650px) { .ble-fixed-body { display:flex; flex-direction:column; } .ble-fixed-stage { flex:none; height:43%; min-height:210px; } .ble-fixed-canvas { min-height:100px; } .ble-fixed-sidebar { flex:1; } .ble-fixed-list { flex:1; } .ble-fixed-guide { flex:1; } .ble-fixed-top span { display:none; } }
.ble-recommendation-panel { position: absolute; bottom: 0; left: 0; right: 0; height: 42vh; z-index: 12; background: #fff; box-shadow: 0 -3px 16px #28345a30; display: flex; flex-direction: column; padding: 8px 10px; box-sizing: border-box; font-size: 13px; }
.ble-recommendation-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: none; padding: 4px 0; }
.ble-recommendation-toolbar button, .ble-recommendation-toolbar select { border: 1px solid #cbd2e6; border-radius: 5px; padding: 4px 6px; background: #f5f7fc; }
.ble-recommendation-list { overflow-y: auto; flex: 1; overscroll-behavior: contain; }
.ble-recommendation-item { display: flex; flex-direction: column; gap: 3px; text-align: left; width: 100%; margin: 4px 0; padding: 8px; border: 1px solid #dbe1ed; border-radius: 7px; background: #fff; color: #273349; overflow-wrap: anywhere; }
.ble-recommendation-item span { font: 600 14px/1.4 'Roboto Mono', monospace; }
.ble-recommendation-formula-row { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.ble-recommendation-formula-row .ble-recommendation-formula { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ble-recommendation-item small { color: #66728b; }
.ble-recommendation-item .ble-grip-start { display: block; font-size: 14px; line-height: 1.5; font-weight: 600; color: #455a72; }
.ble-recommendation-item .ble-grip-step { display: block; font-size: 14px; line-height: 1.55; }
.ble-recommendation-item.selected { border-color: #5b6bf0; background: #eef0ff; }
.ble-recommendation-controls { display: flex; flex: none; gap: 3px; }
.ble-recommendation-controls button { min-width: 32px; min-height: 32px; padding: 4px; border: 1px solid #b8c3e1; border-radius: 6px; background: #fff; color: #344577; cursor: pointer; touch-action: manipulation; }
.ble-recommendation-controls button:disabled { opacity: .45; cursor: default; }
.ble-recommendation-dialog .v-card__text { overflow-y: auto; }
.ble-recommendation-dialog .ble-recommendation-list { max-height: calc(100vh - 120px); }
.ble-selected-recommendation { display: flex; align-items: center; gap: 5px; min-width: 0; margin-top: 4px; padding: 3px 7px; background: #eef0ff; border-radius: 5px; font-size: 11px; }
.ble-selected-recommendation span:nth-child(2) { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ble-multi-slots { display: inline-flex; gap: 3px; font-size: 11px; white-space: nowrap; }
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
.ble-card .ble-compact-header {
  display: flex;
  align-items: center;
  min-height: 20px;
}
.ble-card .ble-flow-settings {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
}
.ble-card .ble-speed-target {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #666;
  font-size: 11px;
  white-space: nowrap;
}
.ble-card .ble-speed-target select {
  max-width: 68px;
  height: 24px;
  border: 1px solid #e3e8f0;
  border-radius: 4px;
  background: #fff;
  color: #333;
  font-size: 11px;
}
.ble-card.ble-card-compact [data-ble-flow-row] > span.ok-text {
  flex-basis: 100%;
  white-space: normal !important;
  overflow: visible !important;
}
.ble-card.ble-card-compact .ble-scramble-actions.ble-compact-actions {
  display: grid;
  grid-template-columns: minmax(72px, 1.45fr) minmax(58px, 1.1fr) repeat(3, minmax(34px, 0.7fr));
  gap: 4px;
  flex-wrap: nowrap;
}
.ble-card.ble-card-compact .ble-compact-actions .v-btn {
  min-width: 0 !important;
  width: 100%;
  padding: 0 4px !important;
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
  .ble-card.ble-card-compact .v-card__text {
    padding: 5px 6px 4px !important;
  }
  .ble-card.ble-card-compact .ble-compact-header {
    min-height: 18px;
  }
  .ble-card.ble-card-compact .ble-scramble-actions.ble-compact-actions {
    grid-template-columns: minmax(66px, 1.45fr) minmax(54px, 1.1fr) repeat(3, minmax(30px, 0.7fr));
    gap: 3px;
    margin-top: 3px;
  }
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
  display: inline-block !important;
  white-space: nowrap;
  min-width: 32px;
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
