export type BackgroundPreset = { name: string; value: string };

// 背景选择入口共用色表，避免全局设置与 BLE Cross 预设漂移。
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { name: "白色", value: "#FFFFFF" },
  { name: "浅灰", value: "#F3F4F6" },
  { name: "米白", value: "#FFF8E7" },
  { name: "淡黄", value: "#FFFDE7" },
  { name: "淡绿", value: "#E8F5E9" },
  { name: "淡青", value: "#465255" },
  { name: "淡蓝", value: "#48515E" },
  { name: "淡紫", value: "#514B5B" },
  { name: "淡粉", value: "#5D4C53" },
  { name: "暗黑", value: "#121212" },
];
