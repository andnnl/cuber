import World from "../../cuber/world";
import Cubelet from "../../cuber/cubelet";
import * as THREE from "three";

const HIGHLIGHT_STATE: WeakMap<THREE.Object3D, { sticker: THREE.Material; mirror: THREE.Material; stickerClone: THREE.Material; mirrorClone: THREE.Material }[]> = new WeakMap();

export function highlightPiece(world: World, initialIndex: number): void {
  const cubelet = world.cube.initials[initialIndex];
  if (!cubelet) {
    return;
  }
  restoreHighlight(cubelet);

  const saved: { sticker: THREE.Material; mirror: THREE.Material; stickerClone: THREE.Material; mirrorClone: THREE.Material }[] = [];

  for (let f = 0; f < 6; f++) {
    const sticker = cubelet.stickers[f];
    const mirror = cubelet.mirrors[f];
    if (!sticker || !sticker.visible) {
      continue;
    }
    const stickerMaterial = sticker.material as THREE.Material;
    const mirrorMaterial = mirror.material as THREE.Material;

    const stickerClone = stickerMaterial.clone();
    const mirrorClone = mirrorMaterial.clone();
    stickerClone.transparent = true;
    stickerClone.opacity = 0.7;
    stickerClone.depthWrite = false;
    mirrorClone.transparent = true;
    mirrorClone.opacity = 0.7;
    mirrorClone.depthWrite = false;

    sticker.material = stickerClone;
    mirror.material = mirrorClone;

    saved.push({
      sticker: stickerMaterial,
      mirror: mirrorMaterial,
      stickerClone,
      mirrorClone,
    });
  }

  HIGHLIGHT_STATE.set(cubelet, saved);
  world.dirty = true;
}

export function restoreHighlight(cubelet: Cubelet): void {
  const saved = HIGHLIGHT_STATE.get(cubelet);
  if (!saved || saved.length === 0) {
    return;
  }
  let i = 0;
  for (let f = 0; f < 6; f++) {
    const sticker = cubelet.stickers[f];
    const mirror = cubelet.mirrors[f];
    if (!sticker || !sticker.visible) {
      continue;
    }
    const entry = saved[i++];
    if (!entry) {
      continue;
    }
    sticker.material = entry.sticker;
    mirror.material = entry.mirror;

    if (entry.stickerClone) {
      (entry.stickerClone as any).dispose();
    }
    if (entry.mirrorClone) {
      (entry.mirrorClone as any).dispose();
    }
  }
  HIGHLIGHT_STATE.delete(cubelet);
}

export function clearAllHighlights(world: World): void {
  for (const cubelet of world.cube.initials) {
    restoreHighlight(cubelet);
  }
  world.dirty = true;
}
