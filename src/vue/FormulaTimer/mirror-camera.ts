import * as THREE from 'three';

export function syncMirrorCamera(camera: THREE.PerspectiveCamera, source: THREE.PerspectiveCamera,
  target: THREE.Vector3): void {
  camera.copy(source);
  camera.position.copy(target).multiplyScalar(2).sub(source.position);
  camera.up.copy(source.up).negate();
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}
