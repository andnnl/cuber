import * as THREE from 'three';
import Cubelet from '../../cuber/cubelet';
import { FACE } from '../../cuber/define';
import World from '../../cuber/world';

/** 与 Cube.serialize() 相同的 URFDLB 次序，世界面 → 位置。 */
export const FACELET_TARGETS: [number, FACE][] = (() => {
  const targets: [number, FACE][] = [];
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) targets.push([z * 9 + 6 + x, FACE.U]);
  for (let y = 2; y >= 0; y--) for (let z = 2; z >= 0; z--) targets.push([z * 9 + y * 3 + 2, FACE.R]);
  for (let y = 2; y >= 0; y--) for (let x = 0; x < 3; x++) targets.push([18 + y * 3 + x, FACE.F]);
  for (let z = 2; z >= 0; z--) for (let x = 0; x < 3; x++) targets.push([z * 9 + x, FACE.D]);
  for (let y = 2; y >= 0; y--) for (let z = 0; z < 3; z++) targets.push([z * 9 + y * 3, FACE.L]);
  for (let y = 2; y >= 0; y--) for (let x = 2; x >= 0; x--) targets.push([y * 3 + x, FACE.B]);
  return targets;
})();

export function pieceColorSignature(colors: string[]): string {
  return colors.filter(Boolean).slice().sort().join('');
}

// 使用真实颜色身份注册每种材质；可视淡化不能改变 serialize() 的色字符。
const visColors = new Map<THREE.Material, string>();
const ghostMats: { [color: string]: THREE.MeshLambertMaterial } = {};
const centerMats: { [color: string]: THREE.MeshLambertMaterial } = {};
const softMats: { [color: string]: THREE.MeshLambertMaterial } = {};
const brightMats: { [color: string]: THREE.MeshBasicMaterial } = {};
const softFrame = ((): THREE.MeshPhongMaterial => {
  const mat = Cubelet.CORE.clone() as THREE.MeshPhongMaterial;
  mat.transparent = true;
  mat.opacity = 0.06;
  mat.depthWrite = false;
  return mat;
})();

function visMaterialOf(color: string, mode: 'ghost' | 'center' | 'soft' | 'bright'): THREE.Material {
  if (mode === 'bright') {
    let mat = brightMats[color];
    if (!mat) {
      mat = new THREE.MeshBasicMaterial();
      brightMats[color] = mat;
      visColors.set(mat, color);
    }
    if (Cubelet.LAMBERS[color]) mat.color.copy(Cubelet.LAMBERS[color].color);
    return mat;
  }
  const table = mode === 'ghost' ? ghostMats : mode === 'center' ? centerMats : softMats;
  let mat = table[color];
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({
      transparent: true,
      opacity: mode === 'ghost' ? 0.18 : mode === 'center' ? 0.8 : 0.1,
      depthWrite: false,
    });
    table[color] = mat;
    visColors.set(mat, color);
  }
  if (mode === 'soft') mat.color.setHex(0x80868b);
  else if (Cubelet.LAMBERS[color]) mat.color.copy(Cubelet.LAMBERS[color].color);
  return mat;
}

const originalGetColor = Cubelet.prototype.getColor;
if (!(Cubelet.prototype as { __visPatched?: boolean }).__visPatched) {
  (Cubelet.prototype as { __visPatched?: boolean }).__visPatched = true;
  Cubelet.prototype.getColor = function (this: Cubelet, face: FACE): string {
    const sticker = this.stickers[this.getFace(face)];
    if (sticker) {
      const mapped = visColors.get(sticker.material as THREE.Material);
      if (mapped) return mapped;
    }
    return originalGetColor.call(this, face);
  };
}

/** 两个 3D 场景共用的可视规则；目标块由调用方按实体颜色身份确定。 */
export function paintCubeVisibility(world: World, needed: Set<string> | null, ghost: boolean, hide: boolean, hollow: boolean): void {
  const active = ghost || hide;
  const cube = world.cube;
  const serialized = cube.serialize();
  const posColors: string[][] = Array.from({ length: 27 }, () => ['', '', '', '', '', '']);
  for (let i = 0; i < 54; i++) {
    const [position, face] = FACELET_TARGETS[i];
    posColors[position][face] = serialized[i];
  }
  for (let p = 0; p < 27; p++) {
    const piece = cube.cubelets[p];
    if (!piece || !piece.exist) continue;
    const colors = posColors[p].filter(Boolean);
    const isNeeded = active && colors.length > 1 && !!needed?.has(pieceColorSignature(colors));
    const irrelevant = active && colors.length > 1 && !isNeeded;
    const mode: 'normal' | 'ghost' | 'center' | 'soft' | 'bright' = irrelevant
      ? hide ? 'soft' : 'ghost'
      : isNeeded ? 'bright' : ghost && colors.length === 1 ? 'center' : 'normal';
    // 半透明完全去除骨架；隐藏档无关骨架仅留 0.06 轮廓。
    piece.frame.visible = !ghost;
    piece.frame.material = mode === 'soft' ? softFrame : hollow ? Cubelet.TRANS : Cubelet.CORE;
    for (let face = 0; face < 6; face++) {
      const color = posColors[p][face];
      if (!color) continue;
      const sticker = piece.stickers[piece.getFace(face as FACE)];
      if (!sticker) continue;
      sticker.visible = true;
      sticker.material = mode === 'normal' ? Cubelet.LAMBERS[color] : visMaterialOf(color, mode);
    }
  }
  world.dirty = true;
}
