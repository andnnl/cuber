import Vue from "vue";
import { Component, Provide, Ref, Watch } from "vue-property-decorator";

import Viewport from "../Viewport";
import Setting from "../Setting";
import World from "../../cuber/world";
import { PaletteData, PreferanceData } from "../../data";
import { TwistAction, TwistNode } from "../../cuber/twister";
import Cubelet from "../../cuber/cubelet";
import Rubic from "./rubic";
import Solver from "../../solver/Solver";
import * as WasmSolver from "../../wasm/WasmSolver";
import { indexedDBStorage } from "../../util/IndexedDBStorage";

class KeyHandle {
  width = 2;
  display = false;
  callback: (key: string) => void;
  keymap: { [key: number]: string } = {
    73: "R", //I R
    75: "R'", //K R'
    87: "B", //W B
    79: "B'", //O B'
    83: "D", //S D
    76: "D'", //L D'
    68: "L", //D L
    69: "L'", //E L'
    74: "U", //J U
    70: "U'", //F U'
    72: "F", //H F
    71: "F'", //G F'
    186: "y", //; y
    59: "y", //; y
    65: "y'", //A y'
    85: "r", //U r
    82: "l'", //R l'
    77: "r'", //M r'
    86: "l", //V l
    84: "x", //T x
    89: "x", //Y x
    78: "x'", //N x'
    66: "x'", //B x'
    190: "M'", //. M'
    88: "M'", //X M'
    53: "M", //5 M
    54: "M", //6 M
    80: "z", //P z
    81: "z'", //Q z'
    90: "d", //Z d
    191: "d'", /// d'
    67: "u'", //C u'
    188: "u", //, u
    37: "U", //← U
    38: "R", //↑ R
    39: "U'", //→ U'
    40: "R'", //↓ R'
  };

  constructor(callback: (key: string) => void) {
    this.callback = callback;
    document.addEventListener("keydown", this.keydown, false);
  }

  keydown = (event: KeyboardEvent): boolean => {
    const id = event.keyCode | event.which;

    if (id == 51 || id == 55) {
      this.width = Math.max(2, this.width - 1);
      this.display = true;
    } else if (id == 52 || id == 56) {
      this.width = this.width + 1;
      this.display = true;
    }
    if (id === 8) {
      this.callback("^");
      return false;
    }
    const key = this.keymap[id];
    if (key) {
      let exp = "";
      if (this.width != 2 && ["l", "r", "f", "b", "d", "u"].indexOf(key[0]) >= 0) {
        exp = this.width + key;
      } else {
        exp = key;
      }
      this.callback(exp);
      this.display = false;
    }
    return false;
  };
}

export class PlaygroundData {
  private values = {
    version: "0.4",
    order: 3,
    scrambler: "*",
    history: "",
    scene: "*",
    start: 0,
    now: 0,
    complete: false,
  };

  constructor() {
    this.load();
  }

  load(): void {
    const save = window.localStorage.getItem("playground");
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
    window.localStorage.setItem("playground", JSON.stringify(this.values));
  }

  get order(): number {
    return this.values.order;
  }

  set order(value: number) {
    this.values.order = value;
  }

  get scrambler(): string {
    return this.values.scrambler;
  }

  set scrambler(value: string) {
    this.values.scrambler = value;
  }

  get history(): string {
    return this.values.history;
  }

  set history(value: string) {
    this.values.history = value;
  }

  get scene(): string {
    return this.values.scene;
  }

  set scene(value: string) {
    this.values.scene = value;
  }

  get start(): number {
    return this.values.start;
  }

  set start(value: number) {
    this.values.start = value;
  }

  get now(): number {
    return this.values.now;
  }

  set now(value: number) {
    this.values.now = value;
  }

  get complete(): boolean {
    return this.values.complete;
  }

  set complete(value: boolean) {
    this.values.complete = value;
  }
}

@Component({
  template: require("./index.html"),
  components: {
    viewport: Viewport,
    setting: Setting,
  },
})
export default class Playground extends Vue {
  @Provide("world")
  world: World = new World();

  @Provide("preferance")
  preferance: PreferanceData = new PreferanceData(this.world);

  @Provide("palette")
  palette: PaletteData = new PaletteData(this.world);

  data: PlaygroundData = new PlaygroundData();

  // 求解器实例
  solver: Solver = new Solver();

  // 解法类型
  solveTypes = ["",'底层十字', '第一组F2L', 'OLL解法', 'PLL解法'];
  solveType = '';
  solutionSteps: string[] = [];
  solution = "";

  width = 0;
  height = 0;
  size = 0;

  @Ref("viewport")
  viewport: Viewport;
  keyboard: KeyHandle;

  constructor() {
    super();
    this.keyboard = new KeyHandle((exp: string) => {
      if (exp === "^") {
        this.world.cube.twister.undo();
      } else {
        this.world.cube.twister.twist(new TwistAction(exp), false, true);
      }
    });
  }

  resize(): void {
    this.width = document.documentElement.clientWidth;
    this.height = document.documentElement.clientHeight;
    this.size = Math.ceil(Math.min(this.width / 6, this.height / 12));
    this.viewport?.resize(this.width, this.height - this.size * 1.5);
  }

  mounted(): void {
    this.load();
    this.$nextTick(this.resize);
    this.$nextTick(async () => {
      this.preferance.refresh();
      this.palette.refresh();
      // 页面加载后生成初始解法
      // this.generateSolution();
      
      // 初始化 WASM 求解器
      try {
        await WasmSolver.initWasm();
        console.log('[Playground] WASM 求解器初始化成功');
        
        // 初始化 IndexedDB
        await indexedDBStorage.init();
        
        // 检查是否已缓存搜索表
        const cachedTable = await indexedDBStorage.loadTable();
        if (cachedTable) {
          try {
            await WasmSolver.loadTableFromBytes(cachedTable);
            console.log('[Playground] 从 IndexedDB 加载搜索表成功');
          } catch (error) {
            console.error('[Playground] 从 IndexedDB 加载搜索表失败:', error);
            // 缓存加载失败，生成新的搜索表
            await this.generateWasmTable();
          }
        } else {
          // 没有缓存，生成新的搜索表
          await this.generateWasmTable();
        }
      } catch (error) {
        console.error('[Playground] WASM 求解器初始化失败:', error);
        // WASM 初始化失败，继续使用原始求解器
      }
    });
    this.world.callbacks.push(() => {
      this.callback();
    });
    this.loop();
  }

  async generateWasmTable(): Promise<void> {
    try {
      console.log('[Playground] 开始生成 WASM 搜索表...');
      await WasmSolver.generateTable(8);
      console.log('[Playground] WASM 搜索表生成成功');
      
      // 使用 IndexedDB 缓存搜索表
      try {
        const tableBytes = await WasmSolver.getTableBytes();
        await indexedDBStorage.saveTable(tableBytes);
        console.log('[Playground] 搜索表已缓存到 IndexedDB');
      } catch (error) {
        console.error('[Playground] 缓存搜索表到 IndexedDB 失败:', error);
      }
    } catch (error) {
      console.error('[Playground] 生成 WASM 搜索表失败:', error);
    }
  }

  get score(): string {
    let diff = this.data.now - this.data.start;
    const hour = Math.floor(diff / 1000 / 60 / 60);
    diff = diff % (1000 * 60 * 60);
    const minute = Math.floor(diff / 1000 / 60);
    diff = diff % (1000 * 60);
    const second = Math.floor(diff / 1000);
    diff = diff % 1000;
    const ms = Math.floor(diff / 100);
    const time =
      (hour > 0 ? hour + ":" : "") +
      (minute > 0 ? (Array(2).join("0") + minute).slice(-2) + ":" : "") +
      (Array(2).join("0") + second).slice(-2) +
      "." +
      ms;
    return time + "/" + this.world.cube.history.moves;
  }

  get key(): string {
    let exp = "";
    if (this.keyboard.display) {
      exp = this.keyboard.width.toString();
    }
    return exp;
  }

  completed = false;
  callback(): void {
    this.data.scene = this.world.cube.history.init;
    this.data.history = this.world.cube.history.exp.substring(1);
    if (this.data.complete) {
      this.data.save();
      return;
    }
    this.data.complete = this.world.cube.complete;
    this.data.save();
    if (this.data.complete) {
      this.completed = true;
    }
  }

  breath(): void {
    if (this.world.order < 10) {
      let tick = new Date().getTime();
      tick = (tick / 2000) * Math.PI;
      tick = Math.sin(tick);
      this.world.cube.position.y = (tick * Cubelet.SIZE) / 64;
      this.world.cube.rotation.y = (tick / 768) * Math.PI;
      this.world.cube.dirty = true;
      this.world.cube.updateMatrix();
    }
  }

  loop(): void {
    requestAnimationFrame(this.loop.bind(this));
    this.breath();
    this.viewport.draw();
    if (this.data.complete) {
      return;
    }
    if (this.world.cube.history.moves == 0) {
      this.data.start = 0;
      this.data.now = 0;
    } else {
      if (this.data.start == 0) {
        this.data.start = new Date().getTime();
      }
      if (!this.data.complete) {
        this.data.now = new Date().getTime();
      }
    }
  }

  load(): void {
    // 未初始化
    if (this.data.scene === "*") {
      this.scramble();
      // 页面加载完成后自动触发底层十字解法
      // setTimeout(() => {
      //   console.log('[Playground] 自动触发底层十字解法');
      //   this.solveType = '底层十字';
      //   this.generateSolution();
      // }, 2000);
      return;
    }
    const order = this.data.order;
    const scene = this.data.scene;
    const history = this.data.history;
    this.world.order = order;
    this.world.cube.twister.setup(scene);
    const node = new TwistNode(history);
    const list = node.parse();
    for (const action of list) {
      this.world.cube.twister.twist(action, true, true);
    }
    this.callback();
  }

  scramble(): void {
    this.data.complete = true;
    if (this.data.scrambler === "*") {
      this.world.cube.twister.twist(new TwistAction("*"), true, true);
    } else {
      this.world.cube.twister.setup(this.data.scrambler);
    }
    this.data.complete = this.world.cube.complete;
    this.callback();
    this.data.start = 0;
    this.data.now = 0;
    this.data.save();
  }

  order(): void {
    this.data.order = this.world.order;
    this.data.save();
    this.scramble();
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

  scrambled = false;

  historyd = false;
  tap(key: string): void {
    switch (key) {
      case "scramble":
        this.scrambled = true;
        break;
      case "undo":
        this.world.cube.twister.undo();
        break;
      case "history":
        this.historyd = true;
        break;
      case "share":
        this.share();
        break;
      case "open":
        window.open(this.link);
        this.shared = false;
        break;
      default:
        break;
    }
  }

  shared = false;
  link = "";
  share(): void {
    const data: { [key: string]: unknown } = {};
    const order = this.world.order;
    data["order"] = order;
    const drama = { scene: this.data.scene, action: this.data.history };
    data["drama"] = drama;
    let string = JSON.stringify(data);
    string = window.btoa(string);
    const search = "mode=player&data=" + string;
    this.link = window.location.origin + window.location.pathname + "?" + search;
    this.shared = true;
  }

  adjust(): void {
    if (this.world.order > 3) {
      return;
    }
    this.data.history = Rubic.adjust(this.data.history);
    this.data.save();
    this.load();
  }

  niss(): void {
    if (this.world.order > 3) {
      return;
    }
    const result = Rubic.niss(this.data.scene, this.data.history);
    this.data.scene = result.scene;
    this.data.history = result.history;
    this.data.save();
    this.load();
    this.adjust();
  }

  // 生成解法
  async generateSolution(): Promise<void> {
    try {
      // 根据选择的解法类型生成对应的公式
      switch (this.solveType) {
        case '底层十字':
          // 获取魔方当前状态
          const state = this.world.cube.serialize();
          console.warn('[Playground] 开始生成底层十字解法，状态:', state);
          // 确保solver实例已创建
          if (!this.solver) {
            console.warn('[Playground] Solver实例不存在');
            this.solution = 'error: Solver实例不存在';
            this.solutionSteps = [];
            break;
          }
          // 调用solveCross方法，获取最多5个解法，每个解法不超过8步
          const startTime = Date.now();
          let crossSolutions;
          try {
            crossSolutions = await this.solver.solveCross(state, 5, 8);
            const elapsed = Date.now() - startTime;
            console.warn('[Playground] 底层十字解法生成完成，耗时:', elapsed, 'ms，结果:', crossSolutions);
          } catch (solveError) {
            console.error('[Playground] 生成底层十字解法时出错:', solveError);
            this.solution = 'error: 生成底层十字解法时出错: ' + solveError.message;
            this.solutionSteps = [];
            break;
          }
          // 处理返回的解法
          if (crossSolutions && crossSolutions.length > 0) {
            const firstSolution = crossSolutions[0];
            
            // 检查第一个解法是否为字符串
            if (typeof firstSolution === 'string' && firstSolution.startsWith('error')) {
              // 错误情况
              this.solutionSteps = [];
              this.solution = 'error: 无法生成底层十字解法，结果: ' + JSON.stringify(crossSolutions);
            } else if (typeof firstSolution === 'string' && firstSolution === '') {
              // 空解法表示已经完成十字
              this.solutionSteps = ['已完成底层十字'];
              this.solution = '已完成底层十字';
            } else {
              // 正常解法，将所有解法转换为字符串并格式化，每个解法作为一行
              this.solutionSteps = crossSolutions.map((sol: any, index: number) => {
                let solutionStr = '';
                if (typeof sol === 'string') {
                  solutionStr = sol;
                } else if (Array.isArray(sol)) {
                  // 如果是数组，用空格连接
                  solutionStr = (sol as string[]).join(' ');
                } else {
                  solutionStr = JSON.stringify(sol);
                }
                return `解法${index + 1}: ${solutionStr}`;
              });
              const joinedSolution = this.solutionSteps.join('\n');
              console.warn('[Playground] 生成底层十字解法，最终结果:', joinedSolution);
              console.warn('[Playground] 解法长度:', joinedSolution.length);
              console.warn('[Playground] 解法字符代码:', Array.from(joinedSolution).map(c => `${c}(${c.charCodeAt(0)})`).join(''));
              this.solution = joinedSolution;
            }
          } else {
            this.solutionSteps = [];
            this.solution = 'error: 无法生成底层十字解法，结果: ' + JSON.stringify(crossSolutions);
          }
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

      // 将所有步骤合并为一个字符串显示在textarea中
      this.solution = this.solutionSteps.join(' ');
    } catch (error) {
      this.solution = '生成解法失败: ' + error.message;
      this.solutionSteps = [];
    }
  }

  // 选择步骤
  selectStep(step: string): void {
    // 检查是否包含解法标识（如"解法1: "）
    const match = step.match(/^解法\d+: (.*)$/);
    if (match && match[1]) {
      // 提取实际步骤
      this.solution = match[1];
    } else {
      // 如果是普通步骤，直接使用
      this.solution = step;
    }
  }
}
