import { Component, Inject, Vue } from "vue-property-decorator";
import World from "../../cuber/world";
import { F2L_SLOTS } from "../../cuber/f2l";
import { PieceTracker, PieceDiff } from "./tracker";
import { highlightPiece } from "./highlight";

@Component
export default class F2LTrainer extends Vue {
  @Inject("world") world!: World;

  private slot: any = F2L_SLOTS[0];
  private caseIndex = 0;
  private tracker = new PieceTracker();
  private diffs: PieceDiff[] = [];
  private algs: any[] = [];
  private currentFormula = "";
  private currentScramble = "";
  private state: "idle" | "scramble" | "playing" | "highlighting" = "idle";

  mounted() {
    this.algs = (require("../Algs/algs.json") as any[])
      .find((g) => g.name === "F2L")
      .cases.slice();
    this.randomCase();
  }

  get slotOptions() {
    return F2L_SLOTS.map((s) => s.name);
  }

  get currentCase() {
    return this.algs[this.caseIndex];
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
    this.world.cube.twister.setup(this.currentScramble);
  }

  play() {
    if (this.state === "playing") return;
    this.diffs = [];
    this.state = "playing";
    this.tracker.snapshot(this.world.cube, this.slot);
    this.world.cube.twister.push(this.currentFormula);
    this.world.callbacks.push(() => this.onAnimationEnd());
  }

  replay() {
    this.diffs = [];
    this.state = "idle";
    this.world.cube.twister.setup(this.currentScramble);
    this.$nextTick(() => this.play());
  }

  onAnimationEnd() {
    this.state = "highlighting";
    this.diffs = this.tracker.diff(this.world.cube, this.slot);
    this.highlightResults();
    setTimeout(() => {
      this.state = "idle";
    }, 2000);
  }

  private highlightResults() {
    this.diffs.forEach((d) => {
      const idx = d.type === "corner" ? this.slot.cornerIndex : this.slot.edgeIndex;
      highlightPiece(this.world, idx, 2000);
    });
  }

  private invertFormula(formula: string): string {
    const moves = formula.split(/\s+/);
    const inverted = moves
      .map((m) => {
        if (m.endsWith("2")) return m;
        if (m.endsWith("'")) return m.slice(0, -1);
        return m + "'";
      })
      .reverse()
      .join(" ");
    return inverted;
  }
}
