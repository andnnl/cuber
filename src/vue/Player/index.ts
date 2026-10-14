import Vue from "vue";
import { Component, Inject, Provide, Ref } from "vue-property-decorator";
import { AppRoute, parseAppRoute } from "../../ble/app-route";
import Viewport from "../Viewport";
import Playbar from "../Playbar";
import World from "../../cuber/world";
import { FACE } from "../../cuber/define";
import Setting from "../Setting";
import { PreferanceData, PaletteData } from "../../data";

@Component({
  template: require("./index.html"),
  components: {
    viewport: Viewport,
    playbar: Playbar,
    setting: Setting,
  },
})
export default class Player extends Vue {
  @Inject("navigate") navigate: (route: AppRoute) => void;
  private appActive = true;
  private viewFrame: number | null = null;
  onAppDeactivate(): void { this.appActive = false; if (this.viewFrame !== null) cancelAnimationFrame(this.viewFrame); this.viewFrame = null; }
  onAppActivate(): void { if (this.appActive) return; this.appActive = true; this.resize(); this.loop(); }
  beforeDestroy(): void { this.onAppDeactivate(); }
  @Provide("world")
  world: World = new World();

  @Provide("preferance")
  preferance: PreferanceData = new PreferanceData(this.world);

  @Provide("palette")
  palette: PaletteData = new PaletteData(this.world);

  width = 0;
  height = 0;
  size = 0;

  @Ref("viewport")
  viewport: Viewport;

  @Ref("playbar")
  playbar: Playbar;

  @Ref("setting")
  setting: Setting;

  scene = "";
  action = "";

  constructor() {
    super();
  }

  mounted(): void {
    this.setting.items["order"].disable = true;
    try {
      const string = window.atob(parseAppRoute(location.search).data || "");
      const data = JSON.parse(string);
      if (data.order) {
        this.world.order = data.order;
      }
      if (data.drama) {
        this.scene = data.drama.scene;
        this.playbar.scene = this.scene;
        this.action = data.drama.action;
        this.playbar.action = this.action;
        const stickers = data.drama.stickers;
        if (stickers) {
          for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
            const list = stickers[FACE[face]];
            if (!list) {
              continue;
            }
            for (const sticker in list) {
              const index = Number(sticker);
              const value = list[index];
              this.world.cube.stick(index, face, value);
            }
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
    this.$nextTick(this.resize);
    this.$nextTick(() => {
      this.preferance.refresh();
      this.palette.refresh();
    });
    this.loop();
  }

  loop(): void {
    if (!this.appActive) return;
    this.viewFrame = requestAnimationFrame(() => this.loop());
    this.viewport?.draw();
  }

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
    this.viewport?.resize(this.width, this.height - this.size * 2.6);
    this.playbar?.resize(this.size);
  }

  home(): void {
    this.navigate({ mode: "playground" });
  }

  scriptd = false;
  script(): void {
    this.scriptd = true;
  }
}
