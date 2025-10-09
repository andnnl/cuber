import Vue from "vue";
import { Component, Prop, Inject } from "vue-property-decorator";
import World from "../../../cuber/world";
import { COLORS } from "../../../cuber/define";
import { PaletteData } from "../../../data";

// 定义预设配色方案类型
interface PaletteType {
  R: string;
  L: string;
  U: string;
  D: string;
  F: string;
  B: string;
  [key: string]: string;
}

// 定义预设配色方案
const PRESET_PALETTES: { [key: string]: PaletteType } = {
  "默认": {
    R: "#B71C1C",
    L: "#FF6D00",
    U: "#F0F0F0",
    D: "#FFD600",
    F: "#00A020",
    B: "#0D47A1",
  },
  "黄底": {
    R: "#FF6D00",
    L: "#B71C1C",
    U: "#FFD600",
    D: "#F0F0F0",
    F: "#00A020",
    B: "#0D47A1",
  },
  "鲜艳": {
    R: "#FF0000",
    L: "#FFA500",
    U: "#FFFFFF",
    D: "#FFFF00",
    F: "#00FF00",
    B: "#0000FF",
  },
  "柔和": {
    R: "#E57373",
    L: "#FFB74D",
    U: "#F5F5F5",
    D: "#FFF59D",
    F: "#81C784",
    B: "#64B5F6",
  },
  "深色": {
    R: "#C62828",
    L: "#E65100",
    U: "#E0E0E0",
    D: "#F9A825",
    F: "#2E7D32",
    B: "#1565C0",
  },
};

@Component({
  template: require("./index.html"),
})
export default class Palette extends Vue {
  @Inject("world")
  world: World;

  @Inject("palette")
  data: PaletteData;

  @Prop({ required: true })
  value: boolean;
  get show(): boolean {
    return this.value;
  }
  set show(value) {
    if (!value) {
      this.data.save();
    }
    this.$emit("input", value);
  }

  width = 0;
  height = 0;
  size = 0;

  colors: { [key: string]: string };
  constructor() {
    super();
    this.colors = COLORS;
  }

  mounted(): void {
    this.resize();
  }

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
  }

  colord = false;
  face: string;
  tap(face: string): void {
    this.face = face;
    this.colord = true;
  }

  color(color: string): void {
    this.colord = false;
    this.data.color(this.face, color);
    this.data.save();
  }

  colorv = "#FF0000";

  // 预设配色方案列表
  presets = Object.keys(PRESET_PALETTES);
  selectedPreset = "默认";

  palette: string[] = [
    // DEFAULT
    "#B71C1C",
    "#FF6D00",
    "#0D47A1",
    "#00A020",
    "#FFD600",
    "#F0F0F0",
    // NORMAL
    "#FF0000",
    "#FFA100",
    "#0000FF",
    "#00FF00",
    "#FFFF00",
    "#808080",
    // OTHER
    "#FF0080",
    "#FF00FF",
    "#607D8B",
    "#00FFFF",
    "#795548",
    "#202020",
  ];

  // 应用预设配色方案
  applyPreset(preset: string): void {
    const colors = PRESET_PALETTES[preset];
    for (const key in colors) {
      this.data.color(key, colors[key]);
    }
    this.data.save();
    this.selectedPreset = preset;
  }

  match(color: string): string {
    for (const key in COLORS) {
      if (color == COLORS[key]) {
        return key[0];
      }
    }
    return "";
  }
}
