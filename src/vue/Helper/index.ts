import Vue from "vue";
import { Component, Provide, Ref } from "vue-property-decorator";

import Viewport from "../Viewport";
import { COLORS, FACE } from "../../cuber/define";
import Cubelet from "../../cuber/cubelet";
import Setting from "../Setting";
import World from "../../cuber/world";
import { PreferanceData, PaletteData } from "../../data";
import Solver from "../../solver/Solver";
import ClipboardJS from "clipboard";
import { TwistNode } from "../../cuber/twister";

export class HelperData {
  private values = {
    version: "0.2",
    stickers: {},
    history: "",
  };

  constructor() {
    this.load();
  }

  load(): void {
    const save = window.localStorage.getItem("helper");
    if (save) {
      const data = JSON.parse(save);
      if (data.version != this.values.version) {
        this.save();
        return;
      }
      this.values = data;
    }
  }

  save(): void {
    window.localStorage.setItem("helper", JSON.stringify(this.values));
  }

  get stickers(): { [face: string]: { [index: number]: string } | undefined } {
    return this.values.stickers;
  }

  set stickers(value: { [face: string]: { [index: number]: string } | undefined }) {
    this.values.stickers = value;
  }

  get history(): string {
    return this.values.history;
  }

  set history(value: string) {
    this.values.history = value;
  }
}

@Component({
  template: require("./index.html"),
  components: {
    viewport: Viewport,
    setting: Setting,
  },
})
export default class Helper extends Vue {
  @Provide("world")
  world: World = new World();

  @Provide("preferance")
  preferance: PreferanceData = new PreferanceData(this.world);

  @Provide("palette")
  palette: PaletteData = new PaletteData(this.world);

  data: HelperData = new HelperData();

  solver: Solver = new Solver();

  // 解法类型
  solveTypes = ['底层十字', '第一组F2L', 'OLL解法', 'PLL解法'];
  solveType = '底层十字';
  solutionSteps: string[] = [];

  width = 0;
  height = 0;
  size = 0;

  @Ref("viewport")
  viewport: Viewport;

  @Ref("setting")
  setting: Setting;

  @Ref("copy")
  copy: Vue;

  colort: string[];
  colors: { [key: string]: string };

  constructor() {
    super();
    this.colors = COLORS;
    this.colort = ["R", "F", "D", "L", "B", "U"];
  }

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
    this.viewport?.resize(this.width, this.height - this.size * 4);
  }

  mounted(): void {
    new ClipboardJS(this.copy.$el);
    this.world.callbacks.push(() => {
      this.callback();
    });

    this.setting.items["order"].disable = true;
    this.reload();
    this.world.controller.taps.push((index: number, face: number) => {
      this.stick(index, face);
    });

    this.$nextTick(this.resize);
    this.$nextTick(() => {
      this.preferance.refresh();
      this.palette.refresh();
    });
    this.loop();
  }

  callback(): void {
    this.data.history = this.world.cube.history.exp;
    this.data.save();
  }

  clear(): void {
    this.stickers = {};
    this.data.stickers = this.stickers;
    this.data.save();
    this.reload();
  }

  reset(): void {
    this.world.cube.reset();
    this.stickers = {};
    for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
      const key = FACE[face];
      const group = this.world.cube.table.face(key);
      const list = [];
      for (const indice of group.indices) {
        list[indice] = key;
      }
      this.stickers[FACE[face]] = list;
    }
    this.data.stickers = this.stickers;
    this.data.save();
    this.reload();
  }

  reload(): void {
    this.world.order = 3;
    this.stickers = this.data.stickers;
    const node = new TwistNode(this.data.history);
    const list = node.parse();
    for (const action of list) {
      this.world.cube.twister.twist(action, true, true);
    }
    this.callback();

    const strip: { [face: string]: number[] | undefined } = {};
    for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
      const key = FACE[face];
      const group = this.world.cube.table.face(key);
      strip[key] = group.indices;
    }
    this.world.cube.strip(strip);
    for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
      const list = this.stickers[FACE[face]];
      if (!list) {
        continue;
      }
      for (const sticker in list) {
        const index = Number(sticker);
        const value = list[index];
        this.world.cube.stick(index, face, value);
      }
    }
    this.state = this.world.cube.serialize();
  }

  loop(): void {
    requestAnimationFrame(this.loop.bind(this));
    this.viewport.draw();
    this.solver.init();
  }

  get style(): unknown {
    return {
      width: this.size + "px",
      height: this.size + "px",
      "min-width": "0%",
      "min-height": "0%",
      "text-transform": "none",
      flex: 1,
    };
  }

  color = "R";
  stickers: { [face: string]: { [index: number]: string } | undefined } = {};
  state = "";
  get faces(): { [face: string]: number } {
    const ret: { [face: string]: number } = {};
    for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
      const key = FACE[face];
      ret[key] = 0;
    }
    for (const c of this.state) {
      ret[c]++;
    }
    return ret;
  }

  stick(index: number, face: number): void {
    if (index < 0) {
      return;
    }
    const cubelet: Cubelet = this.world.cube.cubelets[index];
    index = cubelet.initial;
    face = cubelet.getFace(face);
    let arr = this.stickers[FACE[face]];
    if (arr == undefined) {
      arr = {};
      this.stickers[FACE[face]] = arr;
    }
    arr[index] = this.color;
    this.world.cube.stick(index, face, this.color);
    this.data.stickers = this.stickers;
    this.data.save();
    this.state = this.world.cube.serialize();
  }

  solutiond = false;
  solution = "";
  solve(): void {
    const state = this.world.cube.serialize();
    this.solution = this.solver.solve(state);
    if (this.solution.length == 0) {
      this.solution = "error: solved";
    }
    this.solutiond = true;
    return;
  }

  play(): void {
    const data: { [key: string]: unknown } = {};
    const order = this.world.order;
    data["order"] = order;
    const drama = { scene: this.world.cube.history.exp, action: this.solution, stickers: this.stickers };
    data["drama"] = drama;
    let string = JSON.stringify(data);
    string = window.btoa(string);
    const search = "mode=player&data=" + string;
    const link = window.location.origin + window.location.pathname + "?" + search;
    window.open(link);
  }

  // 生成解法
  async generateSolution(): Promise<void> {
    try {
      // 显示加载状态
      this.solution = "正在计算解法...";
      this.solutionSteps = [];
      
      // 打印当前魔方状态
      const currentState = this.world.cube.serialize();
      console.log("[Helper] 当前魔方状态: " + currentState);
      
      // 根据选择的解法类型生成对应的公式
      switch (this.solveType) {
        case '底层十字':
          // 异步调用solveCross方法
          this.solutionSteps = await this.solveCrossAsync();
          break;
        case '第一组F2L':
          this.solutionSteps = this.solver.solveF2L();
          break;
        case 'OLL解法':
          this.solutionSteps = this.solver.solveOLL();
          break;
        case 'PLL解法':
          this.solutionSteps = this.solver.solvePLL();
          break;
        default:
          this.solutionSteps = [];
      }

      console.log("[Helper] 解法步骤: ", this.solutionSteps);

      // 处理解法显示
      if (this.solutionSteps.length > 0) {
        // 检查是否是多个解法（包含"解法1:", "解法2:"等标识）
        if (this.solutionSteps[0].startsWith('解法')) {
          // 多个解法，下拉框显示所有解法，文本框显示第一个解法的内容
          console.log("[Helper] 处理多个解法");
          const match = this.solutionSteps[0].match(/^解法\d+: (.*)$/);
          if (match && match[1]) {
            this.solution = match[1].trim();
          } else {
            this.solution = this.solutionSteps[0];
          }
        } else {
          // 单个解法，文本框显示解法内容
          console.log("[Helper] 处理单个解法");
          this.solution = this.solutionSteps[0];
          // 如果是"已完成底层十字"这样的提示信息，清空solutionSteps避免在下拉框中显示
          if (this.solutionSteps[0] === '已完成底层十字') {
            console.log("[Helper] 已完成底层十字，清空solutionSteps");
            this.solutionSteps = [];
          }
        }
      } else {
        // 没有解法的情况
        console.log("[Helper] 没有解法");
        if (!this.solution || this.solution === "正在计算解法...") {
          this.solution = "无法生成解法";
        }
      }
      
      console.log("[Helper] 最终显示的解法: ", this.solution);
      console.log("[Helper] 下拉框中的解法步骤: ", this.solutionSteps);
    } catch (error) {
      console.error("[Helper] 生成解法出错: ", error);
      this.solution = '生成解法失败: ' + error.message;
      this.solutionSteps = [];
    }
  }

  // 异步调用solveCross方法
  private solveCrossAsync(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      try {
        // 使用setTimeout将计算放到下一个事件循环中执行，避免阻塞UI
        setTimeout(() => {
          try {
            // 获取魔方当前状态
            const state = this.world.cube.serialize();
            console.log("[Helper] 调用solveCross方法，传入魔方状态: " + state);
            
            // 调用solveCross方法，获取最多5个解法，每个解法不超过8步
            const crossSolutions = this.solver.solveCross(state, 5, 8);
            
            // 打印返回的解法
            console.log("[Helper] solveCross返回的解法: ", crossSolutions);
            
            // 处理返回的解法
            if (crossSolutions.length > 0 && !crossSolutions[0].startsWith('error')) {
              // 修复：确保正确处理解法
              if (crossSolutions.length === 1 && crossSolutions[0] !== '') {
                // 单个解法，不解开步骤，作为一个完整解法返回
                console.log("[Helper] 单个解法: ", crossSolutions[0]);
                resolve([crossSolutions[0]]);
              } else if (crossSolutions.length === 1 && crossSolutions[0] === '') {
                // 空解法表示已经完成十字
                console.log("[Helper] 已完成底层十字");
                resolve(['已完成底层十字']);
              } else {
                // 有多个解法，每个解法作为一个元素
                const formattedSolutions = crossSolutions.map((sol, index) => `解法${index + 1}: ${sol}`);
                console.log("[Helper] 多个解法: ", formattedSolutions);
                resolve(formattedSolutions);
              }
            } else if (crossSolutions.length > 0 && crossSolutions[0].startsWith('error')) {
              // 错误情况
              console.log("[Helper] 解法错误: ", crossSolutions[0]);
              this.solution = crossSolutions[0];
              resolve([]);
            } else {
              // 没有找到解法
              console.log("[Helper] 未找到解法");
              resolve([]);
              this.solution = 'error: 无法生成底层十字解法';
            }
          } catch (error) {
            console.error("[Helper] solveCross方法执行出错: ", error);
            this.solution = 'error: solveCross方法执行出错: ' + error.message;
            reject(error);
          }
        }, 0);
      } catch (error) {
        console.error("[Helper] 异步调用出错: ", error);
        this.solution = 'error: 异步调用出错: ' + error.message;
        reject(error);
      }
    });
  }

  // 选择步骤
  selectStep(step: string): void {
    console.log("[Helper] 选择步骤: ", step);
    // 检查是否包含解法标识（如"解法1: "）
    const match = step.match(/^解法\d+: (.*)$/);
    if (match && match[1]) {
      // 提取实际步骤
      console.log("[Helper] 提取解法内容: ", match[1]);
      this.solution = match[1].trim();
    } else {
      // 对于不包含解法标识的项，直接使用完整内容
      console.log("[Helper] 直接使用解法内容: ", step);
      this.solution = step.trim();
    }
  }
}
