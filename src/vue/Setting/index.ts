import Vue from "vue";
import { Component, Inject } from "vue-property-decorator";
import { AppRoute } from "../../ble/app-route";
import Order from "../Menu/Order";
import Control from "../Menu/Control";
import Appear from "../Menu/Appear";
import Camera from "../Menu/Camera";
import Palette from "../Menu/Palette";
import About from "../Menu/About";
import { BackgroundMode, BackgroundStore } from "../background-store";
import { BACKGROUND_PRESETS } from "../background-presets";
import './index.css';

export class SettingItem {
  label: string;
  show: boolean;
  disable: boolean;
  value: boolean;
  emit: string | undefined;

  constructor(label: string, emit: string | undefined = undefined) {
    this.label = label;
    this.show = true;
    this.disable = false;
    this.value = false;
    this.emit = emit;
  }
}

@Component({
  template: require("./index.html"),
  components: {
    order: Order,
    appear: Appear,
    camera: Camera,
    control: Control,
    palette: Palette,
    about: About,
  },
})
export default class Setting extends Vue {
  @Inject("navigate") navigate: (route: AppRoute) => void;
  @Inject("getActiveMode") getActiveMode: () => string;
  @Inject("cubeBackground") background: BackgroundStore;
  readonly backgroundPresets = BACKGROUND_PRESETS;
  get mode(): string { return this.getActiveMode(); }
  backgroundVersion = 0;
  private stopBackground: (() => void) | null = null;
  get globalColor(): string | null { void this.backgroundVersion; return this.background.globalColor; }
  get pageBackgroundMode(): BackgroundMode { void this.backgroundVersion; return this.background.mode(this.mode); }
  get pageBackgroundColor(): string {
    void this.backgroundVersion;
    return this.background.effective(this.mode, this.mode === "cfop" ? "#EEF1F7" : "#FFFFFF");
  }

  setGlobalBackground(value: string): void { this.background.setGlobal(value); }
  resetGlobalBackground(): void { this.background.setGlobal(null); }
  setPageBackgroundMode(value: BackgroundMode): void { this.background.setMode(this.mode, value); }
  setPageBackground(value: string): void { this.background.setCustom(this.mode, value); }
  menu = false;

  items: { [key: string]: SettingItem } = {};

  constructor() {
    super();
    this.items["order"] = new SettingItem("阶数");
    this.items["control"] = new SettingItem("控制");
    this.items["appear"] = new SettingItem("显示");
    this.items["camera"] = new SettingItem("镜头");
    this.items["palette"] = new SettingItem("配色");
    this.items["about"] = new SettingItem("关于");
  }
  mounted(): void {
    this.stopBackground = this.background.subscribe(() => { this.backgroundVersion++; });
    this.resize();
  }

  beforeDestroy(): void { this.stopBackground?.(); }

  width = 0;
  height = 0;
  size = 0;

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
  }

  tap(key: string | SettingItem): void {
    switch (key) {
      case "playground":
      case "director":
      case "helper":
      case "algs":
      case "f2l":
      case "crossf2l":
      case "blecross":
      case "cfop":
      case "pll6":
      case "seamlessop":
      case "formulatimer":
        this.navigate({ mode: key });
        break;
      default:
        if (key instanceof SettingItem) {
          if (key.emit) {
            this.$emit(key.emit);
          } else {
            key.value = true;
          }
        }
        break;
    }
    this.menu = false;
  }
}
