import * as THREE from 'three';
import World from '../../cuber/world';
import Cubelet from '../../cuber/cubelet';

export type OpPoint = { x: number; y: number; visible: boolean };

/** Screen projection for the 54 serialized sticker slots in U R F D L B order. */
export function projectOpStickers(world: World, width: number, height: number): OpPoint[] {
  if (!width || !height) return [];
  world.scene.updateMatrixWorld(true);
  world.camera.updateMatrixWorld(true);
  const unit = Cubelet.SIZE;
  const face = unit * 1.5 + 0.4;
  return Array.from({ length: 54 }, (_, i) => {
    const row = Math.floor(i % 9 / 3), col = i % 3, side = Math.floor(i / 9);
    const u = (col - 1) * unit, v = (1 - row) * unit;
    const centers = [new THREE.Vector3(u, face, -v), new THREE.Vector3(face, v, -u),
      new THREE.Vector3(u, v, face), new THREE.Vector3(u, -face, v),
      new THREE.Vector3(-face, v, u), new THREE.Vector3(-u, v, -face)];
    const normals = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1)];
    const position = world.cube.localToWorld(centers[side]);
    const normal = normals[side].transformDirection(world.cube.matrixWorld);
    const projected = position.clone().project(world.camera);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2,
      visible: normal.dot(world.camera.position.clone().sub(position)) > 0 &&
        Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1 };
  });
}
