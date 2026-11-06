import { Component, Inject, Vue } from 'vue-property-decorator';
import * as THREE from 'three';
import World from '../../cuber/world';
import { syncMirrorCamera } from './mirror-camera';

@Component({template:'<div class="formula-timer-mirror" role="img" aria-label="当前魔方背面和底面（只读）"></div>'})
export default class MirrorCube extends Vue {
  @Inject('world') world: World;
  private readonly camera = new THREE.PerspectiveCamera();
  private renderer: THREE.WebGLRenderer | null = null;

  mounted(): void {
    this.renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xffffff, 0);
    this.$el.appendChild(this.renderer.domElement);
    this.$emit('ready');
  }
  resize(width: number, height: number): void {
    if (!this.renderer || width <= 0 || height <= 0) return;
    this.renderer.setSize(width / 2, height / 2, true);
    this.draw(true);
  }
  draw(changed = false): void {
    if (!this.renderer || !changed) return;
    syncMirrorCamera(this.camera, this.world.camera, this.world.scene.position);
    this.renderer.clear();
    this.renderer.render(this.world.scene, this.camera);
  }
  beforeDestroy(): void {
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
