import { Component, Inject, Prop, Provide, Ref, Vue, Watch } from 'vue-property-decorator';
import * as THREE from 'three';
import World from '../../cuber/world';
import { FACELET_TARGETS } from '../BleCrossTrainer/visibility';
import { advancedF2LMask, applyAdvancedF2LMask } from '../../ble/adv-f2l';
import MirrorCube from './MirrorCube';

@Component({components:{mirrorCube:MirrorCube}, template:'<div class="formula-timer-next-render" aria-label="下一题魔方（只读）"><mirror-cube v-if="mirror" ref="mirrorCube" aria-label="下一题魔方背面和底面（只读）" @ready="$emit(\'ready\')"></mirror-cube></div>'})
export default class NextCube extends Vue {
  @Inject('world') sourceWorld: World;
  @Prop({required:true}) facelets: string;
  @Prop({default:false}) mirror: boolean;
  @Prop({default:''}) scramble: string;
  @Prop({default:null}) mask: ReturnType<typeof advancedF2LMask> | null;
  @Provide('world') readonly world = new World();
  @Ref('mirrorCube') mirrorCube: MirrorCube;
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
  @Watch('scramble')
  @Watch('mask')
  paint(): void {
    if (!/^[URFDLB]{54}$/.test(this.facelets)) return;
    applyAdvancedF2LMask(this.world.cube, null);
    this.world.cube.twister.setup(this.scramble);
    if (!this.scramble) FACELET_TARGETS.forEach(([position, face], index) => this.world.cube.stick(position, face, this.facelets[index]));
    if (this.mask) applyAdvancedF2LMask(this.world.cube, this.mask);
    this.world.dirty = true;
  }
  resize(width: number, height: number): void {
    if (!this.renderer || width <= 0 || height <= 0) return;
    this.world.width = width;
    this.world.height = height;
    this.renderer.setSize(width, height, true);
    this.world.resize();
    this.mirrorCube?.resize(width, height);
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
    this.mirrorCube?.draw(true);
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
