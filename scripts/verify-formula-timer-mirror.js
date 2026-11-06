async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const saved = await page.evaluate(() => localStorage.getItem('formulaTimer.v1'));
  const originalSize = page.viewportSize();
  try {
    await page.evaluate(() => localStorage.removeItem('formulaTimer.v1'));
    await page.reload();
    await page.locator('[data-formula-mirror]').waitFor();
    assert(!await page.locator('[data-formula-mirror]').isChecked(), '小窗默认应关闭');
    await page.locator('[data-formula-mirror]').check();
    await page.locator('.formula-timer-mirror canvas').waitFor();
    const verify = async () => {
      const result = await page.evaluate(() => {
        const vm = window.__appShell.currentView();
        const area = vm.$refs.cubeArea.getBoundingClientRect();
        const element = vm.mirrorCube.$el;
        const mini = element.getBoundingClientRect();
        const canvas = element.querySelector('canvas').getBoundingClientRect();
        const before = vm.world.cube.serialize();
        const records = vm.records.length;
        const started = vm.training.startedAt;
        vm.mirrorCube.draw(true);
        const sameState = before === vm.world.cube.serialize() && records === vm.records.length && started === vm.training.startedAt;
        return {width:mini.width / area.width, height:mini.height / area.height,
          canvasWidth:canvas.width / area.width, canvasHeight:canvas.height / area.height,
          x:mini.x - area.x, y:mini.y - area.y, preload:vm.preloadActive, pointer:getComputedStyle(element).pointerEvents,
          sameWorld:vm.mirrorCube.world === vm.world, sameState,
          passthrough:!element.contains(document.elementFromPoint(mini.x + 5, mini.y + 5))};
      });
      assert(Math.abs(result.width - 0.5) < 0.01 && Math.abs(result.height - 0.5) < 0.01, '小窗不是主视图一半');
      assert(Math.abs(result.canvasWidth - 0.5) < 0.01 && Math.abs(result.canvasHeight - 0.5) < 0.01, '画布比例错误');
      assert((result.preload ? result.x < -1 : Math.abs(result.x) < 1) && Math.abs(result.y) < 1, '预打乱时小窗应左移，单魔方位置不变');
      assert(result.pointer === 'none' && result.passthrough, '小窗拦截了操作');
      assert(result.sameWorld && result.sameState, '小窗未共享当前动画或修改了计时状态');
    };
    await verify();
    const images = await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      vm.mirrorCube.draw(true);
      const first = vm.mirrorCube.$el.querySelector('canvas').toDataURL();
      vm.world.cube.twister.setup('R U F');
      vm.mirrorCube.draw(true);
      return [first, vm.mirrorCube.$el.querySelector('canvas').toDataURL()];
    });
    assert(images[0] !== images[1], '转动后小窗画面没有变化');
    await page.reload();
    await page.locator('.formula-timer-mirror canvas').waitFor();
    assert(await page.locator('[data-formula-mirror]').isChecked(), '刷新丢失开关选择');
    await page.locator('[data-formula-preload]').check();
    const verifyNext = async () => {
      await page.locator('.formula-timer-next .formula-timer-mirror canvas').waitFor();
      const result = await page.evaluate(() => {
        const vm = window.__appShell.currentView();
        const next = vm.nextCube;
        const mirror = next.mirrorCube;
        const area = vm.$refs.nextCubeArea.getBoundingClientRect();
        const mini = mirror.$el.getBoundingClientRect();
        mirror.draw(true);
        const canvas = mirror.$el.querySelector('canvas');
        const buffer = document.createElement('canvas');
        buffer.width = canvas.width;
        buffer.height = canvas.height;
        const context = buffer.getContext('2d');
        context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(0, 0, buffer.width, buffer.height).data;
        let firstPixel = buffer.width;
        for (let row = 0; row < buffer.height; row++) {
          for (let column = 0; column < buffer.width; column++) {
            if (pixels[(row * buffer.width + column) * 4 + 3]) firstPixel = Math.min(firstPixel, column);
          }
        }
        return {sameWorld:mirror.world === next.world, independent:mirror.world !== vm.world,
          state:mirror.world.cube.serialize(), expected:vm.queuedCase.initialFacelets,
          visibleLeft:mini.x + firstPixel * mini.width / buffer.width - area.x,
          width:mini.width / area.width, height:mini.height / area.height, x:mini.x - area.x};
      });
      assert(result.sameWorld && result.independent && result.state === result.expected, '下一题镜像必须显示预生成题目而非当前题');
      assert(Math.abs(result.width - 0.5) < 0.01 && Math.abs(result.height - 0.5) < 0.01 && result.x < -1, '下一题镜像应半尺寸并左移');
      assert(result.visibleLeft >= -1, '小窗左移后不能被边框裁掉色块');
    };
    for (const layout of ['alternate', 'fixed-left']) {
      await page.locator('[data-formula-preload-layout]').selectOption(layout);
      await verify();
      await verifyNext();
      const switched = await page.evaluate(() => {
        const vm = window.__appShell.currentView();
        const next = vm.queuedCase.initialFacelets;
        const advanced = vm.advanceQueuedCase();
        vm.world.cube.twister.finish();
        return advanced && vm.world.cube.serialize() === next;
      });
      assert(switched, '切换后未接入预生成题目');
      await page.waitForTimeout(150);
      await verify();
      await verifyNext();
    }
    await page.setViewportSize({width:480, height:850});
    await page.waitForTimeout(150);
    await verify();
    await verifyNext();
    const beforeToggle = await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      return [vm.world.cube.serialize(), vm.records.length, vm.training.startedAt];
    });
    await page.locator('[data-formula-mirror]').uncheck();
    assert(await page.locator('.formula-timer-mirror').count() === 0, '关闭后未销毁小窗');
    const afterToggle = await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      return [vm.world.cube.serialize(), vm.records.length, vm.training.startedAt];
    });
    assert(JSON.stringify(beforeToggle) === JSON.stringify(afterToggle), '开关改变了题目或计时');
    console.log('镜像小魔方：半尺寸、透传、实时画面、切题、两种布局、窄屏、持久化与关闭均通过');
  } finally {
    await page.evaluate(saved => saved === null ? localStorage.removeItem('formulaTimer.v1') : localStorage.setItem('formulaTimer.v1', saved), saved);
    if (originalSize) await page.setViewportSize(originalSize);
    await page.reload();
  }
}
