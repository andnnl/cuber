import Vue from "vue";
import { Component, Prop, Inject } from "vue-property-decorator";
import World from "../../../cuber/world";
import { COLORS } from "../../../cuber/define";
import { PaletteData, PRESET_PALETTES } from "../../../data";

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
    this.selectedPreset = this.data.preset;
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
    "#FF6D00",
    "#B71C1C",
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
    // 配色应用与 preset 记录统一由 PaletteData 处理 (先记录再保存, 确保持久化)
    this.data.applyPreset(preset);
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
