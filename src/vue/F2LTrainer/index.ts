import { Component, Provide, Ref, Vue } from "vue-property-decorator";
import World from "../../cuber/world";
import { F2L_SLOTS } from "../../cuber/f2l";
import { PieceTracker, PieceDiff } from "./tracker";
import { clearAllHighlights, highlightPiece } from "./highlight";
import Viewport from "../Viewport";
import Setting from "../Setting";
import { PreferanceData, PaletteData } from "../../data";
import { TwistNode } from "../../cuber/twister";

@Component({
  template: require("./index.html"),
  components: {
    viewport: Viewport,
    setting: Setting,
  },
})
export default class F2LTrainer extends Vue {
  @Provide("world")
  world: World = new World();

  @Provide("preferance")
  preferance: PreferanceData = new PreferanceData(this.world);

  @Provide("palette")
  palette: PaletteData = new PaletteData(this.world);

  private slot: string = F2L_SLOTS[0].name;
  private caseIndex = 0;
  private tracker = new PieceTracker();
  private diffs: PieceDiff[] = [];
  private algs: any[] = [];
  private currentFormula = "";
  private currentScramble = "";
  private state: "idle" | "scramble" | "playing" | "highlighting" = "idle";
  private steps: string[] = [];
  private stepIndex = 0;

  @Ref("viewport")
  viewport: Viewport;

  width = 0;
  height = 0;
  size = 0;

  get selectedSlot() {
    return F2L_SLOTS.find((s) => s.name === this.slot) || F2L_SLOTS[0];
  }

  mounted() {
    try {
      const raw = require("../Algs/algs.json");
      const group = (Array.isArray(raw) ? raw : []).find((g: any) => g.name === "F2L");
      this.algs = group && group.items ? group.items.slice() : [];
      if (this.algs.length > 0) {
        this.randomCase();
      } else {
        console.warn("[F2LTrainer] F2L cases not found");
      }
    } catch (e) {
      console.error("[F2LTrainer] load algs.json failed", e);
    }
    this.resize();
    this.loop();
    this.world.callbacks.push(() => this.onAnimationEnd());
  }

  get slotOptions() {
    return F2L_SLOTS.map((s) => s.name);
  }

  get stepDisplay() {
    return this.steps.length === 0
      ? ""
      : `${this.stepIndex} / ${this.steps.length}`;
  }

  get currentCase() {
    if (this.algs.length === 0) {
      return { name: "加载中...", origin: "", scramble: "" };
    }
    return this.algs[this.caseIndex] || { name: "", origin: "", scramble: "" };
  }

  randomCase() {
    this.caseIndex = Math.floor(Math.random() * this.algs.length);
    this.loadCase(this.currentCase);
  }

  nextCase() {
    this.caseIndex = (this.caseIndex + 1) % this.algs.length;
    this.loadCase(this.currentCase);
  }

  prevCase() {
    this.caseIndex = (this.caseIndex - 1 + this.algs.length) % this.algs.length;
    this.loadCase(this.currentCase);
  }

  loadCase(c: any) {
    this.diffs = [];
    this.state = "idle";
    this.currentFormula = c.origin;
    this.currentScramble = c.scramble || this.invertFormula(c.origin);
    this.steps = TwistNode.SPLIT_SEGMENT(this.currentFormula);
    this.stepIndex = 0;
    clearAllHighlights(this.world);
    this.world.cube.twister.setup(this.currentScramble);
    this.tracker.snapshot(this.world.cube, this.selectedSlot);
    this.highlightResults();
  }

  stepForward() {
    if (this.state === "playing" || this.stepIndex >= this.steps.length) {
      return;
    }
    if (this.stepIndex === 0) {
      clearAllHighlights(this.world);
      this.world.cube.twister.setup(this.currentScramble);
      this.tracker.snapshot(this.world.cube, this.selectedSlot);
      this.highlightResults();
    }
    this.state = "playing";
    const move = this.steps[this.stepIndex];
    this.world.cube.twister.push(move);
    this.stepIndex++;
  }

  stepBackward() {
    if (this.state === "playing" || this.stepIndex <= 0) {
      return;
    }
    this.state = "playing";
    const move = this.steps[this.stepIndex - 1];
    const inverted = this.invertMove(move);
    this.world.cube.twister.push(inverted);
    this.stepIndex--;
  }

  private invertMove(move: string): string {
    const repeatMatch = move.match(/^(.+?)(\d+)$/);
    if (repeatMatch) {
      const group = repeatMatch[1];
      const times = repeatMatch[2];
      if (times === "2") return move;
      return this.invertGroup(group) + times;
    }
    if (move.endsWith("2")) return move;
    if (move.endsWith("'")) return move.slice(0, -1);
    return move + "'";
  }

  play() {
    if (this.state === "playing") return;
    this.diffs = [];
    clearAllHighlights(this.world);
    this.world.cube.twister.setup(this.currentScramble);
    this.tracker.snapshot(this.world.cube, this.selectedSlot);
    this.state = "playing";
    this.world.cube.twister.push(this.currentFormula);
  }

  replay() {
    this.diffs = [];
    this.state = "idle";
    this.world.cube.twister.setup(this.currentScramble);
    this.$nextTick(() => this.play());
  }

  reset() {
    this.diffs = [];
    this.state = "idle";
    clearAllHighlights(this.world);
    this.world.cube.twister.setup(this.currentScramble);
  }

  onAnimationEnd() {
    if (this.state !== "playing") {
      return;
    }
    this.state = "highlighting";
    this.diffs = this.tracker.diff(this.world.cube, this.selectedSlot);
    this.highlightResults();
    setTimeout(() => {
      this.state = "idle";
    }, 2000);
  }

  private highlightResults() {
    const indices = this.tracker.getInitialIndices();
    indices.forEach((idx) => highlightPiece(this.world, idx));
  }

  private invertFormula(formula: string): string {
    const moves = TwistNode.SPLIT_SEGMENT(formula);
    const inverted = moves
      .map((m) => {
        const repeatMatch = m.match(/^(.+?)(\d+)$/);
        if (repeatMatch) {
          const group = repeatMatch[1];
          const times = repeatMatch[2];
          if (times === "2") return m;
          return this.invertGroup(group) + times;
        }
        if (m.endsWith("2")) return m;
        if (m.endsWith("'")) return m.slice(0, -1);
        return m + "'";
      })
      .reverse()
      .join(" ");
    return inverted;
  }

  private invertGroup(group: string): string {
    if (group.startsWith("(") && group.endsWith(")")) {
      group = group.slice(1, -1);
    }
    const moves = TwistNode.SPLIT_SEGMENT(group);
    const inverted = moves
      .map((m) => {
        if (m.endsWith("2")) return m;
        if (m.endsWith("'")) return m.slice(0, -1);
        return m + "'";
      })
      .reverse()
      .join(" ");
    return "(" + inverted + ")";
  }

  onResize() {
    this.resize();
  }

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
    this.viewport?.resize(this.width, this.height - this.size * 1.5);
  }

  loop(): void {
    requestAnimationFrame(this.loop.bind(this));
    this.viewport?.draw();
  }
}

// debug
