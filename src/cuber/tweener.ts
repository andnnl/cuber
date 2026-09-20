export class Tween {
  begin: number;
  end: number;
  duration: number;
  callback: Function;
  value: number;
  constructor(begin: number, end: number, duration: number, callback: Function) {
    this.begin = begin;
    this.end = end;
    this.duration = duration;
    this.callback = callback;
    this.value = 0;
  }

  finish(): void {
    this.callback(this.end);
  }

  update(): boolean {
    this.value++;
    // y = 1 - (1-x)^2
    let elapsed = this.value / this.duration;
    elapsed = elapsed > 1 ? 1 : elapsed;
    elapsed = elapsed < 0 ? 0 : elapsed;
    elapsed = elapsed - 1;
    elapsed = 1 - elapsed * elapsed;
    const value = elapsed == 1 ? this.end : this.begin + (this.end - this.begin) * elapsed;
    return this.callback(value);
  }
}

export class Tweener {
  tweens: Tween[];

  get length(): number {
    return this.tweens.length;
  }

  constructor() {
    this.tweens = [];
    this.loop();
  }

  loop(): void {
    requestAnimationFrame(this.loop.bind(this));
    this.update();
  }

  tween(begin: number, end: number, duration: number, update: Function): Tween {
    const tween = new Tween(begin, end, duration, update);
    this.tweens.push(tween);
    return tween;
  }

  update(): boolean {
    if (this.tweens.length === 0) return false;
    // 队列式逐个处理: 处理前先 shift 出数组。tween 完成回调内可能嵌套
    // finish()/新建 tween (如训练器观察期重放), 若处理中仍留在数组里,
    // 嵌套 finish 会把「正在回调中的 tween」二次 finish (drop 重入),
    // 回调返回后的移除也会索引错位误删新建 tween, 导致其永不推进、group 永久持锁。
    // 回调抛异常同样致命: tween 已 shift, 异常会同时跳过回队与 drop 归位解锁,
    // group 永久持锁 → 后续 twist 全部排队失败 → 3D 永久冻结。
    // 故逐个隔离异常: 出错时强制 finish (走 drop 归位+解锁) 兜底, 不影响其余 tween。
    let guard = this.tweens.length;
    while (guard-- > 0 && this.tweens.length > 0) {
      const tween = this.tweens.shift();
      if (!tween) {
        continue;
      }
      let done: boolean;
      try {
        done = tween.update();
      } catch (e) {
        console.error("[Tweener] tween 回调异常, 强制完成兜底", e);
        done = true;
        try {
          tween.finish();
        } catch (e2) {
          console.error("[Tweener] tween 强制完成仍异常", e2);
        }
      }
      if (!done) {
        this.tweens.push(tween);
      }
    }
    return true;
  }

  finish(tween: Tween | undefined = undefined): void {
    if (tween) {
      for (let i = 0; i < this.tweens.length; i++) {
        if (this.tweens[i] == tween) {
          this.tweens.splice(i, 1);
          try {
            tween.finish();
          } catch (e) {
            console.error("[Tweener] finish 异常", e);
          }
          return;
        }
      }
    } else {
      const tweens = this.tweens.splice(0, this.tweens.length);
      for (const tween of tweens) {
        try {
          tween.finish();
        } catch (e) {
          console.error("[Tweener] finish 排空异常, 跳过继续", e);
        }
      }
    }
  }

  cancel(tween: Tween): void {
    for (let i = 0; i < this.tweens.length; i++) {
      if (this.tweens[i] == tween) {
        this.tweens.splice(i, 1);
        return;
      }
    }
  }
}

const tweener = new Tweener();
export default tweener;
