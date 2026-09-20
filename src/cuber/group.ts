import Cubelet from "./cubelet";
import { TwistAction } from "./twister";
import Cube from "./cube";
import * as THREE from "three";
import tweener, { Tween } from "./tweener";

export default class CubeGroup extends THREE.Group {
  public static frames = 30;
  /** 动画时长倍率 (1=正常): 转动镜像积压时置 <1 提速追赶 (蓝牙快拧 3D 跟不上),
   * 其余所有动画入口 (按钮整体转/解法预览/z2 翻转) 前须复位为 1 */
  public static durationScale = 1;
  public static readonly AXIS_VECTOR: { [key: string]: THREE.Vector3 } = {
    a: new THREE.Vector3(1, 1, 1),
    x: new THREE.Vector3(-1, 0, 0),
    y: new THREE.Vector3(0, -1, 0),
    z: new THREE.Vector3(0, 0, -1),
  };

  cube: Cube;
  cubelets: Cubelet[];
  indices: number[];
  axis: string;
  layer: number;
  private holding = false;
  private tween: Tween | undefined = undefined;

  _angle: number;
  set angle(angle) {
    this._angle = angle;
    this.setRotationFromAxisAngle(CubeGroup.AXIS_VECTOR[this.axis], this._angle);
    this.updateMatrix();
    this.cube.dirty = true;
  }

  get angle(): number {
    return this._angle;
  }

  constructor(cube: Cube, axis: string, layer: number) {
    super();
    this.cube = cube;
    this._angle = 0;
    this.cubelets = [];
    this.indices = [];
    this.matrixAutoUpdate = false;
    this.updateMatrix();
    this.axis = axis;
    this.layer = layer;

    const half = (this.cube.order - 1) / 2;
    const table: { [key: string]: string }[] = [
      {
        x: "R",
        y: "U",
        z: "F",
      },
      {
        x: "L'",
        y: "D'",
        z: "B'",
      },
      {
        x: "M'",
        y: "E'",
        z: "S",
      },
    ];
    let type = 0;
    if (this.layer === half) {
      layer = 0;
      type = 2;
    } else if (this.layer < half) {
      type = 1;
    } else {
      layer = this.cube.order - layer - 1;
    }
    const name = table[type][this.axis];
    this.name = (layer === 0 ? "" : String(layer + 1)) + name;
  }

  cancel(): number {
    if (this.tween) {
      // 记录当前动作的角度
      let angle = this.tween.end;
      // 取消当前动作
      tweener.cancel(this.tween);
      this.tween = undefined;
      // 记录取消的动作
      angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      return angle;
    }
    return 0;
  }

  finish(): number {
    if (this.tween) {
      // 记录剩余的角度
      const angle = this.tween.end - this.angle;
      // 完成动作
      tweener.finish(this.tween);
      this.tween = undefined;
      return angle;
    }
    return 0;
  }

  private hold(): boolean {
    const success = this.cube.lock(this.axis, this.layer);
    if (!success) {
      return false;
    }
    this.holding = true;
    for (const i of this.indices) {
      const cubelet = this.cube.cubelets[i];
      this.cubelets.push(cubelet);
      this.cube.remove(cubelet);
      if (cubelet.exist) {
        this.add(cubelet);
      }
    }
    this.cube.add(this);
    return true;
  }

  drag(): boolean {
    while (this.holding) {
      this.angle = -this.finish();
    }
    return this.hold();
  }

  drop(): void {
    this.holding = false;
    this.tween = undefined;
    while (true) {
      const cubelet = this.cubelets.pop();
      if (undefined === cubelet) {
        break;
      }
      this.rotate(cubelet);
      this.remove(cubelet);
      if (cubelet.exist) {
        this.cube.add(cubelet);
      }
      this.cube.cubelets[cubelet.index] = cubelet;
    }
    this.cube.remove(this);
    this.cube.dirty = true;
    this.angle = 0;
    this.cube.unlock(this.axis, this.layer);
    this.cube.callback();
  }

  twist(angle: number, fast: boolean): boolean {
    if (this.holding) {
      angle = angle + this.cancel();
    } else {
      const success = this.hold();
      if (!success) {
        return false;
      }
      this.angle = 0;
    }

    angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
    if (fast) {
      this.angle = angle;
    }
    const delta = angle - this.angle;
    if (Math.abs(this.angle - angle) < 1e-6) {
      this.drop();
    } else {
      const d = Math.abs(delta) / (Math.PI / 2);
      // duration 单位=帧 (rAF tick): 常速四分之一转 30 帧 ≈500ms。
      // durationScale 按镜像积压深度 <1 提速; 下限 2 帧防 0 时长 (elapsed=除零→NaN 不可控)
      const duration = Math.max(2, CubeGroup.frames * (2 - 2 / (d + 1)) * CubeGroup.durationScale);
      this.tween = tweener.tween(this.angle, angle, duration, (value: number) => {
        this.angle = value;
        if (Math.abs(this.angle - angle) < 1e-6) {
          try {
            this.drop();
          } catch (e) {
            // drop 中断 (归位异常/回调链异常) 也必须释放层锁并复位持锁标记,
            // 否则 group 永久持锁 → 后续 twist 全部排队失败 → 3D 永久冻结;
            // 归位不完整由后续 syncScene/cube.reset 修正
            this.holding = false;
            this.tween = undefined;
            this.cube.unlock(this.axis, this.layer);
            console.error("[CubeGroup] drop 异常, 已强制解锁兜底", e);
          }
          return true;
        }
        return false;
      });
    }
    return true;
  }

  rotate(cubelet: Cubelet): void {
    cubelet.rotateOnWorldAxis(CubeGroup.AXIS_VECTOR[this.axis], this.angle);
    cubelet.vector = cubelet.vector.applyAxisAngle(CubeGroup.AXIS_VECTOR[this.axis], this.angle);
    cubelet.updateMatrix();
  }
}

export class RotateAction {
  group: CubeGroup;
  twist: number;
  constructor(group: CubeGroup, twist: number) {
    this.group = group;
    this.twist = twist;
  }
}

export class GroupTable {
  private order: number;
  groups: { [key: string]: CubeGroup[] };

  constructor(cube: Cube) {
    this.order = cube.order;
    this.groups = {};
    // 根据魔方阶数生成所有group
    for (const axis of ["x", "y", "z"]) {
      const list: CubeGroup[] = [];
      for (let layer = 0; layer < this.order; layer++) {
        const g = new CubeGroup(cube, axis, layer);
        list[layer] = g;
      }
      this.groups[axis] = list;
    }
    // 将每个块索引放入x y z的每层中
    for (const cubelet of cube.initials) {
      if (!cubelet.exist) {
        continue;
      }
      const index = cubelet.initial;
      let axis: string;
      let layer: number;
      let group: CubeGroup;

      axis = "x";
      layer = index % this.order;
      group = this.groups[axis][layer];
      group.indices.push(cubelet.index);

      axis = "y";
      layer = Math.floor((index % (this.order * this.order)) / this.order);
      group = this.groups[axis][layer];
      group.indices.push(cubelet.index);

      axis = "z";
      layer = Math.floor(index / (this.order * this.order));
      group = this.groups[axis][layer];
      group.indices.push(cubelet.index);
    }
  }

  private static AXIS_MAP: { [key: string]: string } = {
    R: "x",
    L: "-x",
    U: "y",
    D: "-y",
    F: "z",
    B: "-z",
    M: "-x",
    E: "-y",
    S: "z",
  };

  face(face: string): CubeGroup {
    let layer = 0;
    let sign = GroupTable.AXIS_MAP[face];
    if (sign.length == 2) {
      sign = sign[1];
    } else {
      layer = this.order - 1;
    }
    return this.groups[sign][layer];
  }

  convert(action: TwistAction): RotateAction[] {
    const result: RotateAction[] = [];
    let sign = action.sign;
    if (sign.match(/.[Ww]/)) {
      sign = sign.toLowerCase().replace("w", "");
    }
    if (/[XYZ]/.test(sign)) {
      sign = sign.toLowerCase();
    }
    let group: CubeGroup;
    let twist: number = action.times * (action.reverse ? -1 : 1);
    let layer: number;
    if (sign.length === 1) {
      switch (sign) {
        case "x":
        case "y":
        case "z":
          for (let layer = 0; layer < this.order; layer++) {
            group = this.groups[sign][layer];
            result.push(new RotateAction(group, twist));
          }
          return result;
        case "R":
        case "U":
        case "F":
        case "L":
        case "D":
        case "B":
          layer = 0;
          sign = GroupTable.AXIS_MAP[sign.toUpperCase()];
          if (sign.length == 2) {
            twist = -twist;
            sign = sign[1];
          } else {
            layer = this.order - 1;
          }
          group = this.groups[sign][layer];
          result.push(new RotateAction(group, twist));
          return result;
        case "r":
        case "u":
        case "f":
        case "l":
        case "d":
        case "b":
          layer = 0;
          sign = GroupTable.AXIS_MAP[sign.toUpperCase()];
          if (sign.length == 2) {
            twist = -twist;
            sign = sign[1];
          } else {
            layer = this.order - 2;
          }
          group = this.groups[sign][layer];
          result.push(new RotateAction(group, twist));
          group = this.groups[sign][layer + 1];
          result.push(new RotateAction(group, twist));
          return result;
        case "E":
        case "M":
        case "S":
          layer = Math.floor((this.order - 1) / 2);
          sign = GroupTable.AXIS_MAP[sign.toUpperCase()];
          if (sign.length == 2) {
            twist = -twist;
            sign = sign[1];
          }
          group = this.groups[sign][layer];
          result.push(new RotateAction(group, twist));
          if (this.order % 2 == 0) {
            group = this.groups[sign][layer + 1];
            result.push(new RotateAction(group, twist));
          }
          return result;
        case "e":
        case "m":
        case "s":
          sign = GroupTable.AXIS_MAP[sign.toUpperCase()];
          if (sign.length == 2) {
            twist = -twist;
            sign = sign[1];
          }
          for (let layer = 1; layer < this.order - 1; layer++) {
            group = this.groups[sign][layer];
            result.push(new RotateAction(group, twist));
          }
          return result;
      }
    } else {
      const list = sign.match(/([0123456789]*)(-?)([0123456789]*)([lrudfb])/i);
      if (list == null) {
        return result;
      }
      let from = Number(list[1]);
      let to = Number(list[3]);
      if (to === NaN || to === 0) {
        if (/[lrudfb]/.test(list[4])) {
          to = 1;
        } else {
          to = from;
        }
      }
      if (from > this.order) {
        from = this.order;
      }
      if (to > this.order) {
        to = this.order;
      }
      sign = GroupTable.AXIS_MAP[list[4].toUpperCase()];
      if (sign.length == 2) {
        twist = -twist;
        sign = sign[1];
      } else {
        from = this.order - from + 1;
        to = this.order - to + 1;
      }
      if (from > to) {
        [from, to] = [to, from];
      }
      for (let layer = from - 1; layer < to; layer++) {
        group = this.groups[sign][layer];
        result.push(new RotateAction(group, twist));
      }
    }
    return result;
  }
}
