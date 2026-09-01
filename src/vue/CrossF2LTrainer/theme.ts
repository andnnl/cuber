// CrossF2LTrainer 面板主题样式 (变体 A: 原版白卡微精修)
// 注意: 组件模板中的 <style> 标签会被 vue-template-compiler 剥离 (从未生效),
// 本样式由组件 mounted 钩子注入 document.head

export const TRAINER_THEME_CSS = `
/* ===== 面板卡片: 白卡 + 柔和分层阴影 ===== */
.trainer-overlay-card {
  background: #ffffff !important;
  box-shadow: 0 4px 24px rgba(60, 72, 100, 0.14), 0 1px 4px rgba(60, 72, 100, 0.10) !important;
}
/* 标题: 靛蓝->紫渐变文字 */
.trainer-title {
  background: linear-gradient(120deg, #5b6bf0, #9c27b0);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: bold;
}
/* 通用小按钮: 浅灰底 + 细边框 (紧凑内边距, 保证单行容纳) */
.trainer-overlay-card .v-btn.x-small {
  background: #f4f6fa !important;
  color: #455a64 !important;
  border: 1px solid #e3e8f0;
  box-shadow: none !important;
  padding: 0 8px !important;
  transition: background 0.15s, border-color 0.15s;
}
.trainer-overlay-card .v-btn.x-small:hover {
  background: #eaeef6 !important;
  border-color: #d4dbe8;
}
/* 主按钮 (播放): 靛蓝->紫渐变 */
.trainer-overlay-card .v-btn.primary {
  background: linear-gradient(135deg, #5b6bf0, #7c4dff) !important;
  color: #fff !important;
  border: none;
  box-shadow: 0 2px 8px rgba(91, 107, 240, 0.4) !important;
}
/* 清除按钮 (text 样式) 不加底色 */
.trainer-overlay-card .v-btn.v-btn--text {
  background: transparent !important;
  border: none;
  box-shadow: none !important;
}
/* 槽位切换组: 浅灰底容器, 选中项靛蓝实底 */
.trainer-overlay-card .v-btn-toggle {
  background: #f4f6fa;
  border: 1px solid #e3e8f0;
}
.trainer-overlay-card .v-btn-toggle .v-btn {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: #455a64 !important;
}
.trainer-overlay-card .v-btn-toggle .v-btn.v-btn--active {
  background: #5b6bf0 !important;
  color: #fff !important;
  font-weight: bold;
}
/* 打乱输入框: 浅灰圆角, 去掉 outlined 边框 */
.trainer-overlay-card .v-text-field .v-input__control .v-input__slot {
  background: #f4f6fa !important;
  border: 1px solid #e3e8f0 !important;
  border-radius: 6px !important;
}
.trainer-overlay-card .v-text-field fieldset {
  border: none !important;
}
/* 解法项: 浅底卡片感 + 选中靛蓝 */
.trainer-overlay-card .solution-item {
  background: #f7f9fc;
  border: 1.5px solid transparent;
  font-family: "Roboto Mono", "Consolas", monospace;
  color: #55606c;
  transition: background 0.15s, border-color 0.15s;
}
.trainer-overlay-card .solution-item:hover {
  background: #eef1f8;
}
.trainer-overlay-card .solution-item.solution-selected {
  background: #eef1ff !important;
  border-color: #5b6bf0;
  color: #3b4bd8;
  font-weight: bold;
}
/* 判定结果 (内联在预判行尾, 极简图标态: ✔/✘, 完整文本见 title 提示) */
.trainer-overlay-card .result-inline {
  font-weight: bold;
  font-size: 16px;
  line-height: 1;
  background: transparent !important;
  white-space: nowrap;
}
.trainer-overlay-card .result-inline.success {
  color: #2e7d32;
}
.trainer-overlay-card .result-inline.fail {
  color: #c62828;
}
/* 使用说明弹窗 */
.help-dialog {
  border-radius: 12px !important;
}
.help-dialog .help-title {
  color: #3b4bd8;
  font-weight: bold;
  font-size: 17px;
  padding-bottom: 4px;
}
.help-dialog .help-body div {
  margin: 2px 0;
  color: #4a5568;
}
.help-dialog .help-body b {
  color: #2c3a55;
}
`;
