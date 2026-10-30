import Vue, { VueConstructor } from "vue";
import { Component } from "vue-property-decorator";
import Playground from "../Playground";
import Director from "../Director";
import Player from "../Player";
import Helper from "../Helper";
import Algs from "../Algs";
import F2LTrainer from "../F2LTrainer";
import CrossF2LTrainer from "../CrossF2LTrainer";
import BleCrossTrainer from "../BleCrossTrainer";
import CfopLearning from "../CfopLearning";
import BleConnectTutorial from "../BleConnectTutorial";
import PllObservation from "../PllObservation";
import SeamlessOp from "../SeamlessOp";
import FormulaTimerView from "../FormulaTimer";
import { CubeSession, SessionSnapshot } from "../../ble/cube-session";
import { FollowGate } from "../../ble/follow-gate";
import { AppRoute, parseAppRoute, routeKey, routeUrl } from "../../ble/app-route";
import { nativeBridgeAvailable, webBluetoothAvailable } from "../../ble/cube-link";
import { LinkEvent } from "../../ble/types";
import tweener from "../../cuber/tweener";
import { BackgroundStore } from "../background-store";
import "./index.css";

const views: { [mode: string]: VueConstructor } = {
  playground: Playground, director: Director, player: Player, helper: Helper, algs: Algs,
  f2l: F2LTrainer, crossf2l: CrossF2LTrainer, blecross: BleCrossTrainer, cfop: CfopLearning, bleconnect: BleConnectTutorial,
  pll6: PllObservation, seamlessop: SeamlessOp, formulatimer: FormulaTimerView,
};

@Component({
  template: require("./index.html"),
  provide(this: AppShell) {
    return {
      cubeSession: this.session,
      navigate: (route: AppRoute) => this.navigate(route),
      getActiveMode: () => this.activeMode,
      isFollowing: () => this.following,
      openConnection: () => this.openConnection(),
      cubeBackground: this.background,
    };
  },
})
export default class AppShell extends Vue {
  readonly session = new CubeSession();
  readonly background = new BackgroundStore(window.localStorage);
  backgroundVersion = 0;
  readonly gate = new FollowGate(window.localStorage);
  route: AppRoute = parseAppRoute(location.search);
  snapshot: SessionSnapshot = this.session.snapshot;
  connectionOpen = false;
  scanDevices: { address: string; name: string }[] = [];
  scanMessage = "";
  manualMac = window.localStorage.getItem("bleManualMac") || "";
  macError = "";
  private stopSession: (() => void) | null = null;
  private stopScan: (() => void) | null = null;
  private stopBackground: (() => void) | null = null;

  get activeMode(): string { return this.route.mode; }
  get currentComponent(): VueConstructor { return views[this.activeMode]; }
  get currentKey(): string { return routeKey(this.route); }
  get isCubeView(): boolean { return this.activeMode !== "bleconnect"; }
  get following(): boolean { return this.gate.isEnabled(this.activeMode); }
  get supportsBluetooth(): boolean { return nativeBridgeAvailable() || webBluetoothAvailable(); }
  get nativeBt(): boolean { return nativeBridgeAvailable(); }
  get effectiveBackground(): string {
    void this.backgroundVersion;
    if (this.activeMode === "bleconnect") return "#FFFFFF";
    return this.background.effective(this.activeMode, this.activeMode === "cfop" ? "#EEF1F7" : "#FFFFFF");
  }

  private onBackgroundStorage = (event: StorageEvent): void => {
    if (event.storageArea === window.localStorage &&
        (event.key === null || event.key.indexOf("cubeBackground.") === 0 || event.key === "bleBackgroundColor")) {
      this.background.reload();
    }
  };

  // $refs 非响应式；Vue computed 会缓存第一次页面的实例，必须每次直接读取。
  private currentView(): any { return this.$refs.activeView as Vue | undefined; }

  mounted(): void {
    this.stopBackground = this.background.subscribe(() => { this.backgroundVersion++; });
    window.addEventListener("storage", this.onBackgroundStorage);
    (window as any).__appShell = this;
    (window as any).__cubeSession = this.session;
    this.gate.activate(this.activeMode);
    Vue.prototype.mode = this.activeMode;
    this.stopSession = this.session.subscribe((snapshot) => {
      this.snapshot = snapshot;
      if (this.activeMode === "blecross" || this.activeMode === "cfop" || this.activeMode === "pll6" || this.activeMode === "formulatimer") this.currentView()?.onSessionSnapshot?.(snapshot);
    }, (event) => this.dispatch(event));
    window.addEventListener("popstate", this.onPopState);
    void this.session.tryAutoReconnect();
  }

  beforeDestroy(): void {
    window.removeEventListener("storage", this.onBackgroundStorage);
    this.stopBackground?.();
    window.removeEventListener("popstate", this.onPopState);
    this.closeScan();
    this.stopSession?.();
    this.session.dispose();
  }

  private onPopState = (): void => this.activate(parseAppRoute(location.search));

  onInternalLink(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const anchor = target.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || !url.searchParams.has("mode")) return;
    event.preventDefault();
    this.navigate(parseAppRoute(url.search));
  }

  navigate(route: AppRoute): void {
    // 始终从生成的 URL 解析，保持 URL 和视图一致。
    const url = routeUrl(route, location.pathname);
    if (location.pathname + location.search !== url) window.history.pushState({}, "", url);
    this.activate(parseAppRoute(new URL(url, location.href).search));
  }

  private activate(route: AppRoute): void {
    if (routeKey(route) === this.currentKey) return;
    // 所有 World 共用 tween 队列；切页前落定动画，避免隐藏视图持锁使新页面无法转动。
    tweener.finish();
    this.currentView()?.onAppDeactivate?.();
    this.gate.activate(""); // DOM 切换的一帧里不能把新模式的 MOVE 送给旧 ref。
    this.route = route;
    document.title = route.mode === "bleconnect" ? "蓝牙魔方连接教程 - 魔方栈" : "魔方栈";
    Vue.prototype.mode = route.mode;
    this.$nextTick(() => {
      this.gate.activate(route.mode);
      this.currentView()?.onAppActivate?.();
      this.currentView()?.onSessionSnapshot?.(this.snapshot);
      this.currentView()?.resize?.();
    });
  }

  private dispatch(event: LinkEvent): void {
    const view = this.currentView();
    if (!view) return;
    if (this.activeMode === "pll6") {
      // 计时与六面还原判定不依赖画面跟随开关；仅实时 MOVE 的动画受开关控制。
      if (event.type === "facelets" || event.type === "move")
        view.handlePhysicalEvent?.(event, this.gate.accept(this.activeMode, event));
      return;
    }
    if (this.activeMode === "formulatimer") {
      if (event.type === "facelets" || event.type === "move")
        view.handlePhysicalEvent?.(event, this.gate.accept(this.activeMode, event));
      return;
    }
    if (this.activeMode === "seamlessop") {
      if (event.type === "move" && this.gate.accept(this.activeMode, event) &&
        !view.playing && view.step === 0 && view.world?.cube) view.world.cube.twister.push(event.move);
      return;
    }
    if (event.type === "move") {
      if (!this.gate.accept(this.activeMode, event)) {
        if (this.activeMode === "cfop" && view.needsFacelets) view.handlePhysicalEvent?.(event);
        return;
      }
    } else if (event.type === "facelets" && (this.activeMode === "blecross" || this.activeMode === "cfop") &&
      !this.following && !view.needsFacelets) {
      return;
    } else if (this.activeMode !== "blecross" && this.activeMode !== "cfop") {
      return;
    }
    if (this.activeMode === "blecross" || this.activeMode === "cfop") view.handlePhysicalEvent?.(event);
    else if (event.type === "move" && !view.playbar?.playing && !view.playing && !view.playingBest &&
      view.state !== "playing" && view.phase !== "playing" && view.world?.cube) {
      if (view.applyPhysicalMove) view.applyPhysicalMove(event.move, event.serial);
      else view.world.cube.twister.push(event.move);
    }
  }

  setFollowing(enabled: boolean): void {
    this.gate.setEnabled(this.activeMode, enabled);
    if (this.activeMode === "blecross" || this.activeMode === "cfop") this.currentView()?.onPhysicalFollowChanged?.(enabled);
    this.$forceUpdate();
  }

  resetVisualCube(): void {
    const view = this.currentView();
    if (view?.resetVisualCube) view.resetVisualCube();
    else {
      view?.world?.cube?.twister.setup("");
    }
  }

  openConnection(): void {
    this.connectionOpen = true;
    if (nativeBridgeAvailable() && this.snapshot.status === "disconnected") this.startScan();
  }

  startScan(): void {
    this.closeScan();
    this.scanDevices = [];
    this.scanMessage = "扫描中，请打开魔方并靠近设备…";
    this.stopScan = this.session.scanNative((devices) => {
      this.scanDevices = devices;
      if (devices.length) this.scanMessage = "请选择魔方";
    }, (error) => { this.scanMessage = error; });
  }

  closeScan(): void {
    this.stopScan?.();
    this.stopScan = null;
  }

  closeConnection(): void {
    this.closeScan();
    this.connectionOpen = false;
  }

  async connect(kind: "web" | "mock" | "native", address?: string, useMac = false): Promise<void> {
    this.macError = "";
    let mac = "";
    if (kind === "web" && useMac) {
      const compact = this.manualMac.replace(/[:-]/g, "").trim();
      if (!/^[0-9a-fA-F]{12}$/.test(compact)) {
        this.macError = "请输入有效的 12 位十六进制 MAC 地址";
        return;
      }
      mac = compact.match(/.{2}/g)!.join(":").toUpperCase();
    }
    this.closeScan();
    try {
      const opts = kind === "native" ? { address } : kind === "web" && useMac ? { mac } : undefined;
      if (kind === "web" && useMac) window.localStorage.setItem("bleManualMac", mac);
      await this.session.connect(kind, opts);
      this.connectionOpen = false;
    } catch {
      // 错误保存在共享 snapshot 并在连接面板显示。
    }
  }

  async disconnect(): Promise<void> { await this.session.disconnect(); }
}
