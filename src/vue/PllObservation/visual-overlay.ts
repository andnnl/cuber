import * as THREE from 'three';
import World from '../../cuber/world';
import Cubelet from '../../cuber/cubelet';

export type StickerPoint = { number: number; x: number; y: number; visible: boolean };

/** F 18～20、R 9～11：按 Cube.serialize 的面贴纸顺序投影。 */
export function projectPllSix(world: World, width: number, height: number): StickerPoint[] {
  if (!width || !height) return [];
  world.scene.updateMatrixWorld(true);
  world.camera.updateMatrixWorld(true);
  const unit = Cubelet.SIZE;
  const face = unit * 1.5 + 0.4;
  const rows = [
    { normal: new THREE.Vector3(0, 0, 1), centers: [-unit, 0, unit].map(x => new THREE.Vector3(x, unit, face)) },
    { normal: new THREE.Vector3(1, 0, 0), centers: [unit, 0, -unit].map(z => new THREE.Vector3(face, unit, z)) }
  ];
  const points: StickerPoint[] = [];
  rows.forEach((row, side) => row.centers.forEach((center, index) => {
    const position = world.cube.localToWorld(center.clone());
    const normal = row.normal.clone().transformDirection(world.cube.matrixWorld);
    const front = normal.dot(world.camera.position.clone().sub(position)) > 0;
    const projected = position.project(world.camera);
    points.push({ number: side * 3 + index + 1, x: (projected.x + 1) * width / 2,
      y: (1 - projected.y) * height / 2,
      visible: front && projected.z >= -1 && projected.z <= 1 &&
        projected.x >= -1 && projected.x <= 1 && projected.y >= -1 && projected.y <= 1 });
  }));
  return points;
}
