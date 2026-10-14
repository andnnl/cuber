async page => {
  let base = '';
  for (const candidate of ['http://127.0.0.1:18081/', 'http://127.0.0.1:18080/', 'http://127.0.0.1:8080/']) {
    try {
      await page.goto(candidate + '?mode=blecross');
      await page.waitForSelector('[data-app-shell]', { timeout: 1500 });
      base = candidate;
      break;
    } catch { /* 下一个本地开发端口 */ }
  }
  if (!base) throw new Error('未找到 Cuber 本地开发服务');
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  const initial = await page.evaluate(() => {
    window.__originalWorld = window.__bleCross.world;
    window.__originalSession = window.__cubeSession;
    window.__documentToken = Math.random();
    return window.__documentToken;
  });
  await page.locator('button').filter({ hasText: 'menu' }).first().click();
  await page.locator('.v-bottom-sheet button').filter({ hasText: 'games' }).first().click();
  await page.waitForFunction(() => window.__appShell.activeMode === 'playground');
  if (await page.evaluate(token => window.__documentToken !== token, initial)) throw new Error('菜单切换重载文档');
  await page.goBack();
  await page.waitForFunction(() => window.__appShell.activeMode === 'blecross');
  await page.evaluate(() => window.__appShell.navigate({ mode: 'playground' }));
  await page.waitForFunction(() => location.search === '' && window.__appShell.activeMode === 'playground');
  if (await page.evaluate(token => window.__documentToken !== token || window.__cubeSession !== window.__originalSession, initial)) {
    throw new Error('切换菜单时重载了文档或连接会话');
  }
  await page.goBack();
  await page.waitForFunction(() => window.__appShell.activeMode === 'blecross');
  if (await page.evaluate(() => window.__bleCross.world !== window.__originalWorld)) {
    throw new Error('返回训练页后魔方画面实例未保留');
  }
  await page.goForward();
  await page.waitForFunction(() => window.__appShell.activeMode === 'playground');
  const follow = await page.evaluate(async () => {
    const shell = window.__appShell;
    await shell.connect('mock');
    const cube = shell.$refs.activeView.world.cube;
    cube.twister.setup('');
    const before = cube.serialize();
    shell.session.mockApplyFormula('R');
    await new Promise(resolve => setTimeout(resolve, 500));
    cube.twister.finish();
    return { before, after: cube.serialize() };
  });
  if (follow.before === follow.after) throw new Error(`普通魔方未跟随实体新转动: ${JSON.stringify(follow)}`);
  const isolation = await page.evaluate(async () => {
    const shell = window.__appShell;
    const cube = shell.$refs.activeView.world.cube;
    cube.twister.setup('');
    shell.setFollowing(false);
    shell.session.mockApplyFormula('U');
    await new Promise(resolve => setTimeout(resolve, 40));
    cube.twister.finish();
    const closed = cube.serialize();
    shell.setFollowing(true);
    cube.twister.finish();
    const reopened = cube.serialize();
    shell.session.mockApplyFormula('F');
    await new Promise(resolve => setTimeout(resolve, 40));
    cube.twister.finish();
    const next = cube.serialize();
    shell.resetVisualCube();
    return { closed, reopened, next, reset: cube.serialize() };
  });
  if (isolation.closed !== isolation.reopened || isolation.closed === isolation.next || isolation.closed !== isolation.reset) {
    throw new Error(`跟随开关或画面还原异常: ${JSON.stringify(isolation)}`);
  }
  const preferences = await page.evaluate(async () => {
    const shell = window.__appShell;
    shell.setFollowing(false);
    shell.navigate({ mode: 'helper' });
    await shell.$nextTick();
    const helper = shell.following;
    shell.navigate({ mode: 'playground' });
    await shell.$nextTick();
    const playground = shell.following;
    shell.setFollowing(true);
    return { helper, playground, saved: localStorage.getItem('bleFollow:playground') };
  });
  if (!preferences.helper || preferences.playground || preferences.saved !== '1') {
    throw new Error(`逐界面跟随偏好串扰: ${JSON.stringify(preferences)}`);
  }
  const cross = await page.evaluate(async () => {
    const shell = window.__appShell;
    shell.navigate({ mode: 'blecross' });
    await shell.$nextTick();
    const vm = window.__bleCross;
    const shared = vm.link === shell.session;
    shell.setFollowing(false);
    vm.phase = 'solving';
    vm.running = false;
    vm.predicted = shell.session.snapshot.facelets;
    await new Promise(resolve => setTimeout(resolve, 50));
    vm.world.cube.twister.setup('');
    const beforeClosed = vm.world.cube.serialize();
    shell.session.mockApplyFormula('R');
    await new Promise(resolve => setTimeout(resolve, 60));
    vm.world.cube.twister.finish();
    const closed = vm.world.cube.serialize();
    shell.setFollowing(true);
    vm.phase = 'success';
    vm.autoNext = true;
    vm.scheduleAutoNext(120);
    const remaining = vm.autoNextDeadline - Date.now();
    shell.navigate({ mode: 'playground' });
    await shell.$nextTick();
    const stopped = vm.resultTimer === null && vm.animationFrameId === null;
    shell.session.mockApplyFormula('U');
    await new Promise(resolve => setTimeout(resolve, 180));
    const stayedSuccess = vm.phase === 'success';
    shell.navigate({ mode: 'blecross' });
    await shell.$nextTick();
    const resumed = vm.autoNextDeadline - Date.now();
    vm.clearAutoNextSchedule();
    return { shared, stopped, remaining, resumed, stayedSuccess, beforeClosed, closed };
  });
  if (!cross.shared || !cross.stopped || !cross.stayedSuccess || cross.beforeClosed !== cross.closed || Math.abs(cross.remaining - cross.resumed) > 60) {
    throw new Error(`BLECross 会话或暂停异常: ${JSON.stringify(cross)}`);
  }
  const link = await page.evaluate(async () => {
    const shell = window.__appShell;
    shell.navigate({ mode: 'bleconnect' });
    await shell.$nextTick();
    const token = shell.session;
    document.querySelector('[data-ble-connect-start]').click();
    await shell.$nextTick();
    return { mode: shell.activeMode, sameSession: shell.session === token };
  });
  if (link.mode !== 'blecross' || !link.sameSession) throw new Error(`教程链接丢失连接: ${JSON.stringify(link)}`);
  const pause = await page.evaluate(async () => {
    const shell = window.__appShell;
    const vm = window.__bleCross;
    vm.clearAutoNextSchedule();
    vm.phase = 'solving';
    vm.running = true;
    vm.moveCount = 2;
    vm.solveStart = Date.now() - 1000;
    vm.timerStart = vm.solveStart;
    shell.navigate({ mode: 'playground' });
    await shell.$nextTick();
    shell.session.mockApplyFormula('L');
    await new Promise(resolve => setTimeout(resolve, 100));
    const backgroundCount = vm.moveCount;
    shell.navigate({ mode: 'blecross' });
    await shell.$nextTick();
    return { backgroundCount, activeMs: Date.now() - vm.solveStart };
  });
  if (pause.backgroundCount !== 2 || pause.activeMs < 990 || pause.activeMs > 1150) {
    throw new Error(`训练暂停未隔离后台转动/耗时: ${JSON.stringify(pause)}`);
  }
  const observation = await page.evaluate(async () => {
    const shell = window.__appShell;
    const vm = window.__bleCross;
    vm.phase = 'observing';
    vm.running = true;
    vm.observeStart = Date.now() - 100;
    shell.navigate({ mode: 'playground' });
    await shell.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 250));
    shell.navigate({ mode: 'blecross' });
    await shell.$nextTick();
    return Date.now() - vm.observeStart;
  });
  if (observation < 80 || observation > 180) throw new Error(`BLECross 观察期未暂停: ${observation}ms`);
  const background = await page.evaluate(async () => {
    const shell = window.__appShell;
    const vm = window.__bleCross;
    vm.phase = 'solving';
    vm.running = true;
    vm.bestPlayQueue = ['R'];
    vm.playingBest = true;
    vm.bestPlayTimer = setTimeout(() => vm.playNextBestMove(), 80);
    vm.scheduleBleBaselineHeal(vm.world.cube.serialize());
    const scene = vm.world.cube.serialize();
    shell.navigate({ mode: 'playground' });
    await shell.$nextTick();
    const cancelled = vm.bestPlayTimer === null && vm.bleBaselineHealTimer === null && !vm.playingBest;
    await shell.session.disconnect();
    await new Promise(resolve => setTimeout(resolve, 220));
    shell.navigate({ mode: 'blecross' });
    await shell.$nextTick();
    const afterDisconnect = { status: vm.status, running: vm.running, phase: vm.phase, scene: vm.world.cube.serialize() === scene };
    const disconnected = afterDisconnect.status === 'disconnected' && vm.isManual && !afterDisconnect.running && afterDisconnect.phase === 'ready' && afterDisconnect.scene;
    const manualScene = vm.world.cube.serialize();
    const oldGeneration = vm.sessionGeneration;
    shell.navigate({ mode: 'playground' });
    await shell.$nextTick();
    await shell.connect('mock');
    shell.navigate({ mode: 'blecross' });
    await shell.$nextTick();
    const afterReconnect = { generation: vm.sessionGeneration, oldGeneration, status: vm.status, scene: vm.world.cube.serialize() === manualScene };
    const rebased = afterReconnect.generation !== oldGeneration && afterReconnect.status === 'connected' && afterReconnect.scene;
    return { cancelled, disconnected, rebased, afterDisconnect, afterReconnect };
  });
  if (!background.cancelled || !background.disconnected || !background.rebased) {
    throw new Error(`BLECross 后台断线/回调取消或新连接代际异常: ${JSON.stringify(background)}`);
  }
  const payload = await page.evaluate(() => btoa(JSON.stringify({ order: 3, drama: { scene: "R U", action: "R'", stickers: {} } })));
  await page.goto(`${base}?mode=player&data=${encodeURIComponent(payload)}`);
  await page.waitForFunction(() => window.__appShell && window.__appShell.activeMode === 'player');
  const playerScene = await page.evaluate(() => window.__appShell.$refs.activeView.scene);
  if (playerScene !== 'R U') throw new Error(`播放器直达参数丢失: ${playerScene}`);
  const playback = await page.evaluate(async () => {
    const shell = window.__appShell;
    await shell.connect('mock');
    const vm = shell.$refs.activeView;
    vm.world.cube.twister.finish();
    const before = vm.world.cube.serialize();
    vm.playbar.playing = true;
    shell.session.mockApplyFormula('F');
    await new Promise(resolve => setTimeout(resolve, 50));
    vm.world.cube.twister.finish();
    const unchanged = vm.world.cube.serialize() === before;
    vm.playbar.playing = false;
    return unchanged;
  });
  if (!playback) throw new Error('播放器播放期间实体转动改变了画面');
  const f2lPause = await page.evaluate(async () => {
    const shell = window.__appShell;
    shell.navigate({ mode: 'crossf2l' });
    await shell.$nextTick();
    const vm = shell.$refs.activeView;
    for (let i = 0; i < 40 && vm.solving; i++) await new Promise(resolve => setTimeout(resolve, 50));
    await new Promise(resolve => setTimeout(resolve, 500));
    vm.timerStart = performance.now() - 100;
    vm.running = true;
    const started = { start: vm.timerStart, now: performance.now(), phase: vm.phase };
    shell.navigate({ mode: 'player', data: 'e30=' });
    await shell.$nextTick();
    const inactive = { start: vm.timerStart, now: performance.now(), pausedAt: vm.pausedAt };
    await new Promise(resolve => setTimeout(resolve, 350));
    shell.navigate({ mode: 'crossf2l' });
    await shell.$nextTick();
    return { elapsed: performance.now() - vm.timerStart, started, inactive, resumed: vm.timerStart };
  });
  if (f2lPause.elapsed < 80 || f2lPause.elapsed > 230) throw new Error(`CrossF2L 隐藏时计时仍推进: ${JSON.stringify(f2lPause)}`);
  const staleSolve = await page.evaluate(async () => {
    const vm = window.__appShell.$refs.activeView;
    let finishOld;
    vm.solveMode = 'cross';
    await vm.$nextTick();
    vm.solver.solveCross = () => new Promise(resolve => { finishOld = resolve; });
    vm.solver.solveXCross = async () => [['F']];
    const old = vm.solve();
    vm.solveMode = 'xcross';
    await vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 10));
    finishOld([['R']]);
    await old;
    return { solutions: vm.solutions.slice(), solving: vm.solving };
  });
  if (staleSolve.solutions[0] !== 'F' || staleSolve.solving) {
    throw new Error(`CrossF2L 旧求解结果覆盖新模式: ${JSON.stringify(staleSolve)}`);
  }
  await page.addInitScript(() => {
    window.__nativeCalls = [];
    window.__bleNative = {
      scan() { window.__nativeCalls.push('scan'); },
      stopScan() { window.__nativeCalls.push('stop'); },
      connect() {}, disconnect() {}, write() {},
    };
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__appShell);
  const nativeScan = await page.evaluate(() => {
    const shell = window.__appShell;
    shell.openConnection();
    window.__ble.dispatch('scan', JSON.stringify({ address: 'AA:BB', name: 'GAN' }));
    const listed = shell.scanDevices.some(device => device.address === 'AA:BB');
    shell.closeConnection();
    return { listed, calls: window.__nativeCalls.slice() };
  });
  if (!nativeScan.listed || !nativeScan.calls.includes('scan') || !nativeScan.calls.includes('stop')) {
    throw new Error(`Android 原生扫描入口异常: ${JSON.stringify(nativeScan)}`);
  }
  return '全局连接与历史导航通过';
}
