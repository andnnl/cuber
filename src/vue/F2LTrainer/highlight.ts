import World from "../../cuber/world";
import Cubelet from "../../cuber/cubelet";
import * as THREE from "three";

export function highlightPiece(world: World, initialIndex: number, duration = 2000): void {
  const cubelet = world.cube.initials[initialIndex];
  const highlightMat = Cubelet.createHighlightMaterial();
  const highlightBasic = new THREE.MeshBasicMaterial({ color: 0xFF0080 });
  const saved: { sticker: THREE.Material; mirror: THREE.Material; face: number }[] = [];

  for (let f = 0; f < 6; f++) {
    const sticker = cubelet.stickers[f];
    const mirror = cubelet.mirrors[f];
    if (sticker.visible) {
      saved.push({
        face: f,
        sticker: sticker.material as THREE.Material,
        mirror: mirror.material as THREE.Material,
      });
      sticker.material = highlightMat;
      mirror.material = highlightBasic;
    }
  }

  setTimeout(() => {
    saved.forEach(({ face, sticker, mirror }) => {
      cubelet.stickers[face].material = sticker;
      cubelet.mirrors[face].material = mirror;
    });
    highlightMat.dispose();
    highlightBasic.dispose();
    world.dirty = true;
  }, duration);

  world.dirty = true;
}
