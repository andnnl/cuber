// 双色高亮模块 (覆层方案)
// 不修改贴纸原色, 在贴纸表面叠加: 半透明填充 (呼吸脉动) + 粗实体边框条
// 颜色 A (target): 目标 F2L 块 (最终要填入槽位的角块+棱块) — 绑定块, 随块移动
// 颜色 B (predict): 用户预判的位置 — 绑定位置, 固定在魔方坐标系中不随层转动
// 颜色 C (answer): 预留

import World from "../../cuber/world";
import Cubelet from "../../cuber/cubelet";
import * as THREE from "three";

// 高亮配色
export const HIGHLIGHT_COLORS = {
  target: 0x9c27b0, // 紫色 - 目标块 (颜色 A)
  predict: 0x00bcd4, // 青色 - 预判位置 (颜色 B)
  answer: 0x4caf50, // 绿色 - 预留
};

interface HighlightEntry {
  color: number;
  overlays: THREE.Object3D[];
  disposables: (THREE.Material | THREE.BufferGeometry)[];
}

// 块绑定高亮 (颜色 A): key 为 Cubelet 对象, 覆层随块移动
const PIECE_HIGHLIGHTS: WeakMap<Cubelet, HighlightEntry> = new WeakMap();
// 预判位置锚定 (颜色 B, 未播放态): 挂在块上, 与块一起平滑跟随所有转动 (整体旋转/拨层)
const ANCHOR_HIGHLIGHTS: WeakMap<Cubelet, HighlightEntry> = new WeakMap();
// 位置绑定高亮 (颜色 B, 播放态): key 为位置索引, 覆层固定在魔方坐标系, 不随层转动
const POSITION_HIGHLIGHTS: Map<number, HighlightEntry & { parent: THREE.Object3D }> = new Map();

// 预判覆层 (青色) 相对贴纸的尺寸比例: 缩小后与同块上的紫色目标覆层错开,
// 紫色边框在外圈完整可见, 青色框在内圈, 不再互相遮盖
const PREDICT_SCALE = 0.88;

// 呼吸动画注册表: 填充材质透明度随时间脉动
interface PulsingMaterial {
  material: THREE.MeshBasicMaterial;
  base: number;
  amp: number;
  phase: number;
}
const PULSING: PulsingMaterial[] = [];
const T0 = performance.now();

// 每帧驱动呼吸动画 (由组件渲染循环调用)
export function tickHighlights(): void {
  const t = (performance.now() - T0) / 1000;
  for (const item of PULSING) {
    item.material.opacity = item.base + Math.sin(t * 3.2 + item.phase) * item.amp;
  }
}

// 创建覆层内容: 呼吸半透明填充 + 粗实体相框边条 (内部坐标以贴纸中心为原点)
// scale: 相对贴纸的尺寸比例 (青色预判覆层 <1, 缩小后与同块紫色目标覆层错开, 不再完全遮盖)
// 返回的 group 未设置位置/朝向, 由调用方按绑定方式放置
function createOverlay(source: THREE.Mesh, color: number, lift: number, scale: number = 1): { overlay: THREE.Group; disposables: (THREE.Material | THREE.BufferGeometry)[]; pulse: PulsingMaterial } {
  // 读取贴纸平面尺寸 (局部 XY 平面, 法向 Z), 按 scale 缩放布局尺寸
  source.geometry.computeBoundingBox();
  const bb = source.geometry.boundingBox!;
  const w = (bb.max.x - bb.min.x) * scale;
  const h = (bb.max.y - bb.min.y) * scale;
  const cx = ((bb.max.x + bb.min.x) / 2) * scale;
  const cy = ((bb.max.y + bb.min.y) / 2) * scale;

  // 半透明填充 (呼吸): 缩放填充网格, 边框按缩放后尺寸布置
  const fillMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const pulse: PulsingMaterial = { material: fillMaterial, base: 0.5, amp: 0.22, phase: Math.random() * Math.PI * 2 };

  // 粗实体边框条 (相框式; 厚度为贴纸 7%)
  const barThickness = Math.max(w, h) * 0.07;
  const barDepth = barThickness * 0.9;
  const frameMaterial = new THREE.MeshBasicMaterial({ color });
  const barHorizontal = new THREE.BoxGeometry(w + barThickness, barThickness, barDepth);
  const barVertical = new THREE.BoxGeometry(barThickness, h + barThickness, barDepth);
  const zOut = barDepth / 2 + lift; // 沿法向浮出贴纸表面

  const overlay = new THREE.Group();
  const fill = new THREE.Mesh(source.geometry, fillMaterial);
  fill.scale.set(scale, scale, 1);
  overlay.add(fill);

  for (const [geo, x, y] of [
    [barHorizontal, cx, cy + h / 2],
    [barHorizontal, cx, cy - h / 2],
    [barVertical, cx + w / 2, cy],
    [barVertical, cx - w / 2, cy],
  ] as [THREE.BoxGeometry, number, number][]) {
    const bar = new THREE.Mesh(geo, frameMaterial);
    bar.position.set(x, y, zOut);
    overlay.add(bar);
  }

  return {
    overlay,
    disposables: [fillMaterial, frameMaterial, barHorizontal, barVertical],
    pulse,
  };
}

// 遍历块的可见贴纸生成覆层并应用变换
function buildOverlays(cubelet: Cubelet, color: number, place: (sticker: THREE.Mesh, overlay: THREE.Group) => void, scale: number = 1): { overlays: THREE.Object3D[]; disposables: (THREE.Material | THREE.BufferGeometry)[]; pulses: PulsingMaterial[] } {
  const overlays: THREE.Object3D[] = [];
  const disposables: (THREE.Material | THREE.BufferGeometry)[] = [];
  const pulses: PulsingMaterial[] = [];
  for (let f = 0; f < 6; f++) {
    const sticker = cubelet.stickers[f];
    // 仅处理已加入场景的可见贴纸
    if (sticker && sticker.visible && cubelet.children.indexOf(sticker) >= 0) {
      const { overlay, disposables: d, pulse } = createOverlay(sticker, color, 0.01, scale);
      place(sticker, overlay);
      overlays.push(overlay);
      disposables.push(...d);
      pulses.push(pulse);
    }
  }
  return { overlays, disposables, pulses };
}

function registerPulses(entry: HighlightEntry, pulses: PulsingMaterial[]): void {
  PULSING.push(...pulses);
  entry.disposables.push(...pulses.map((p) => p.material));
}

// 为指定块添加指定颜色覆层 (绑定块, 随块移动; 同一块同一时刻仅保留一种颜色)
export function highlightPiece(world: World, initialIndex: number, color: number): void {
  const cubelet = world.cube.initials[initialIndex];
  if (!cubelet) {
    return;
  }
  const current = PIECE_HIGHLIGHTS.get(cubelet);
  if (current && current.color === color) {
    return;
  }
  // 已有其他颜色覆层, 先移除再重新叠加
  restoreHighlight(cubelet);

  const { overlays, disposables, pulses } = buildOverlays(cubelet, color, (sticker, overlay) => {
    // 作为块的子节点, 跟随块变换; 沿贴纸位置向量略浮出表面
    overlay.position.copy(sticker.position).multiplyScalar(1.02);
    overlay.quaternion.copy(sticker.quaternion);
  });
  const entry: HighlightEntry = { color, overlays, disposables };
  for (const overlay of overlays) {
    cubelet.add(overlay);
  }
  registerPulses(entry, pulses);
  PIECE_HIGHLIGHTS.set(cubelet, entry);
  world.dirty = true;
}

// 移除块绑定覆层
export function restoreHighlight(cubelet: Cubelet): void {
  const entry = PIECE_HIGHLIGHTS.get(cubelet);
  if (!entry) {
    return;
  }
  removeEntry(entry, cubelet);
  PIECE_HIGHLIGHTS.delete(cubelet);
}

// 为指定位置添加颜色覆层 (绑定位置, 固定在魔方坐标系中, 不随层转动)
export function highlightPosition(world: World, index: number, color: number): void {
  const cubelet = world.cube.cubelets[index];
  if (!cubelet) {
    return;
  }
  restorePositionHighlight(world, index);

  // 刷新世界矩阵, 保证拾取的变换是当前状态
  world.cube.updateMatrixWorld(true);
  const cubeInvQ = world.cube.getWorldQuaternion(new THREE.Quaternion()).invert();

  const { overlays, disposables, pulses } = buildOverlays(cubelet, color, (sticker, overlay) => {
    // 取贴纸的世界变换, 转换到魔方根坐标系 (静态), 与块解耦
    const p = sticker.getWorldPosition(new THREE.Vector3());
    const q = sticker.getWorldQuaternion(new THREE.Quaternion());
    world.cube.worldToLocal(p);
    q.premultiply(cubeInvQ);
    overlay.position.copy(p);
    overlay.quaternion.copy(q);
    // 沿贴纸法向额外抬高, 当预判位置恰有紫色目标块时青色覆层绘制在其上方
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    overlay.position.addScaledVector(normal, 0.1);
  }, PREDICT_SCALE);
  const entry: HighlightEntry & { parent: THREE.Object3D } = { color, overlays, disposables, parent: world.cube };
  for (const overlay of overlays) {
    world.cube.add(overlay);
  }
  registerPulses(entry, pulses);
  POSITION_HIGHLIGHTS.set(index, entry);
  world.dirty = true;
}

// 为指定位置添加预判锚定覆层 (挂在块上, 平滑跟随所有转动; 与紫块覆层可共存, 抬高避免 z-fighting)
// 返回锚定的块 (用于后续移除/冻结)
export function highlightAnchor(world: World, index: number, color: number): Cubelet | null {
  const cubelet = world.cube.cubelets[index];
  if (!cubelet) {
    return null;
  }
  restoreAnchor(world, cubelet);
  const { overlays, disposables, pulses } = buildOverlays(cubelet, color, (sticker, overlay) => {
    // 作为块的子节点跟随块变换; 沿贴纸法向抬高, 与同块紫色目标覆层分离
    const lift = new THREE.Vector3(0, 0, 0.11).applyQuaternion(sticker.quaternion);
    overlay.position.copy(sticker.position).multiplyScalar(1.02).add(lift);
    overlay.quaternion.copy(sticker.quaternion);
  }, PREDICT_SCALE);
  const entry: HighlightEntry = { color, overlays, disposables };
  for (const overlay of overlays) {
    cubelet.add(overlay);
  }
  registerPulses(entry, pulses);
  ANCHOR_HIGHLIGHTS.set(cubelet, entry);
  world.dirty = true;
  return cubelet;
}

// 移除预判锚定覆层
export function restoreAnchor(world: World, cubelet: Cubelet): void {
  const entry = ANCHOR_HIGHLIGHTS.get(cubelet);
  if (!entry) {
    return;
  }
  removeEntry(entry, cubelet);
  ANCHOR_HIGHLIGHTS.delete(cubelet);
  world.dirty = true;
}

// 按位置索引移除位置绑定覆层
export function restorePositionHighlight(world: World, index: number): void {
  const entry = POSITION_HIGHLIGHTS.get(index);
  if (!entry) {
    return;
  }
  removeEntry(entry, entry.parent);
  POSITION_HIGHLIGHTS.delete(index);
  world.dirty = true;
}

function removeEntry(entry: HighlightEntry, parent: THREE.Object3D): void {
  for (const overlay of entry.overlays) {
    parent.remove(overlay);
  }
  for (const d of entry.disposables) {
    d.dispose();
  }
  // 从呼吸动画注册表移除本条的材质
  for (let i = PULSING.length - 1; i >= 0; i--) {
    const p = PULSING[i];
    if (entry.disposables.indexOf(p.material) >= 0) {
      PULSING.splice(i, 1);
    }
  }
}

// 清除全部高亮 (块绑定 + 锚定 + 位置绑定)
export function clearAllHighlights(world: World): void {
  for (const cubelet of world.cube.initials) {
    restoreHighlight(cubelet);
    restoreAnchor(world, cubelet);
  }
  for (const index of Array.from(POSITION_HIGHLIGHTS.keys())) {
    restorePositionHighlight(world, index);
  }
  world.dirty = true;
}
