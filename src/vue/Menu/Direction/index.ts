import Vue from "vue";
import { Component, Prop, Inject } from "vue-property-decorator";
import World from "../../../cuber/world";
import { PaletteData, PRE_SCR_OPTIONS } from "../../../data";

@Component({
  template: require("./index.html"),
})
export default class Direction extends Vue {
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

  preScrOptions = PRE_SCR_OPTIONS;
  selectedPreScr = "";

  mounted(): void {
    this.selectedPreScr = this.data.preScr;
    this.resize();
  }

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
  }

  applyPreScr(value: string): void {
    this.data.setPreScr(value);
    this.selectedPreScr = value;
    window.dispatchEvent(new CustomEvent("direction-change", { detail: value }));
    this.$emit("input", false);
  }
}
