import { Component, Inject, Prop, Vue, Watch } from 'vue-property-decorator';
import * as THREE from 'three';
import World from '../../cuber/world';
import { FACELET_TARGETS } from '../BleCrossTrainer/visibility';

@Component({template:'<div class="formula-timer-next-render" aria-label="下一题魔方（只读）"></div>'})
export default class NextCube extends Vue {
  @Inject('world') sourceWorld: World;
  @Prop({required:true}) facelets: string;
  readonly world = new World();
  private renderer: THREE.WebGLRenderer | null = null;

  mounted(): void {
    this.world.controller.stop();
    this.renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0xffffff, 0);
    this.$el.appendChild(this.renderer.domElement);
    this.paint();
    this.$emit('ready');
  }
  @Watch('facelets')
  paint(): void {
    if (!/^[URFDLB]{54}$/.test(this.facelets)) return;
    FACELET_TARGETS.forEach(([position, face], index) => this.world.cube.stick(position, face, this.facelets[index]));
    this.world.dirty = true;
  }
  resize(width: number, height: number): void {
    if (!this.renderer || width <= 0 || height <= 0) return;
    this.world.width = width;
    this.world.height = height;
    this.renderer.setSize(width, height, true);
    this.world.resize();
    this.draw(true);
  }
  draw(force = false): void {
    if (!this.renderer || (!force && !this.world.dirty && !this.world.cube.dirty)) return;
    this.world.scale = this.sourceWorld.scale;
    this.world.perspective = this.sourceWorld.perspective;
    this.world.scene.rotation.copy(this.sourceWorld.scene.rotation);
    this.world.scene.updateMatrix();
    this.world.ambient.intensity = this.sourceWorld.ambient.intensity;
    this.world.directional.intensity = this.sourceWorld.directional.intensity;
    this.world.resize();
    this.renderer.clear();
    this.renderer.render(this.world.scene, this.world.camera);
    this.world.dirty = false;
    this.world.cube.dirty = false;
  }
  beforeDestroy(): void {
    this.world.controller.stop();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }
}
