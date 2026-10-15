async page => {
  await page.goto('http://127.0.0.1:18645/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  await page.evaluate(() => { localStorage.setItem('bleCompactMode', '0'); localStorage.setItem('bleTrainMode', 'cross'); localStorage.setItem('bleSolveSlotMode', 'ALL'); });
  await page.reload();
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  await page.evaluate(() => { window.__bleCross.showBest = false; window.__bleCross.autoNext = false; });
  await page.getByText('新打乱').first().click();
  await page.waitForFunction(() => window.__bleCross.phase === 'observing');
  const before = await page.evaluate(() => ({ count: window.__bleCross.recommendations.length, busy: window.__bleCross.recommendationBusy }));
  if (before.count || before.busy) throw new Error('推荐不得在新打乱时自动搜索');
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => !window.__bleCross.recommendationBusy, null, { timeout: 180000 });
  const cross = await page.evaluate(() => ({ count: window.__bleCross.recommendations.length, visible: document.querySelectorAll('.ble-recommendation-panel .ble-recommendation-item').length }));
  if (!cross.count || cross.visible !== Math.min(4, cross.count)) throw new Error(`Cross 四朝向推荐异常 ${JSON.stringify(cross)}`);
  await page.locator('.ble-recommendation-toolbar button').filter({ hasText: '显示全部' }).click();
  if (await page.locator('.ble-recommendation-panel .ble-recommendation-item').count() !== cross.count) throw new Error('显示全部未覆盖返回候选');
  await page.locator('.ble-recommendation-panel .ble-recommendation-item').first().click();
  const selected = await page.evaluate(() => ({ id: window.__bleCross.selectedRecommendationId, best: window.__bleCross.bestSolution, phase: window.__bleCross.phase }));
  if (!selected.id || selected.best || selected.phase !== 'observing') throw new Error(`选择推荐改动训练基准 ${JSON.stringify(selected)}`);
  const liveMove = await page.evaluate(() => {
    const vm = window.__bleCross;
    let calls = 0;
    const original = vm.analysisClient.request.bind(vm.analysisClient);
    vm.analysisClient.request = (...args) => { calls++; return original(...args); };
    vm.world.cube.twister.push('U');
    vm.world.cube.twister.finish();
    return { calls, count: vm.recommendations.length, phase: vm.phase };
  });
  if (liveMove.calls || liveMove.count !== cross.count) throw new Error(`实时 MOVE 触发推荐重搜索 ${JSON.stringify(liveMove)}`);
  await page.evaluate(() => { document.querySelector('.ble-recommendation-panel .ble-recommendation-list').scrollTop = 120; });
  const beforeFull = await page.evaluate(() => ({ top: document.querySelector('.ble-recommendation-panel .ble-recommendation-list').scrollTop, height: document.querySelector('.ble-recommendation-panel .ble-recommendation-list').scrollHeight }));
  await page.locator('.ble-recommendation-toolbar button').filter({ hasText: '全屏' }).click();
  await page.waitForFunction(() => document.querySelector('.ble-recommendation-dialog .ble-recommendation-list')?.scrollTop >= 80);
  const fullScroll = await page.evaluate(() => ({ saved: window.__bleCross.recommendationScroll, top: document.querySelector('.ble-recommendation-dialog .ble-recommendation-list')?.scrollTop }));
  if (!(await page.locator('.ble-recommendation-dialog').isVisible())) throw new Error('全屏推荐未显示');
  await page.getByText('返回魔方').click();
  if (!(await page.locator('.ble-recommendation-panel').isVisible())) throw new Error('返回后滚动区未恢复');
  if (cross.count > 4) {
    await page.waitForTimeout(150);
    const scroll = await page.evaluate(() => document.querySelector('.ble-recommendation-panel .ble-recommendation-list').scrollTop);
    if (scroll < 80) throw new Error(`返回时滚动位置丢失: ${scroll}, before=${JSON.stringify(beforeFull)}, full=${JSON.stringify(fullScroll)}`);
  }
  await page.locator('select[data-ble-full-only]').first().selectOption('xxcross');
  const xxMode = await page.evaluate(() => ({ mode: window.__bleCross.trainMode, selected: window.__bleCross.selectedRecommendationId, slots: window.__bleCross.selectedSolveSlots }));
  if (xxMode.mode !== 'xxcross' || xxMode.selected || xxMode.slots.length !== 2) throw new Error(`模式切换未取消旧结果 ${JSON.stringify(xxMode)}`);
  await page.locator('[data-ble-solve-slot-mode]').selectOption('FIXED');
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => !window.__bleCross.recommendationBusy, null, { timeout: 180000 });
  const xx = await page.evaluate(() => ({ count: window.__bleCross.recommendations.length, error: window.__bleCross.recommendationError,
    slots: window.__bleCross.recommendations.map(item => item.physicalSlots.length) }));
  if (!xx.count || xx.slots.some(n => n !== 2)) throw new Error(`XXCross 固定双槽异常 ${JSON.stringify(xx)}`);
  await page.locator('select[data-ble-full-only]').first().selectOption('xxxcross');
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => !window.__bleCross.recommendationBusy, null, { timeout: 180000 });
  const xxx = await page.evaluate(() => ({ count: window.__bleCross.recommendations.length, error: window.__bleCross.recommendationError,
    slots: window.__bleCross.recommendations.map(item => item.physicalSlots.length) }));
  if (!xxx.count || xxx.slots.some(n => n !== 3)) throw new Error(`XXXCross 固定三槽异常 ${JSON.stringify(xxx)}`);
  const judged = await page.evaluate(() => {
    const vm = window.__bleCross;
    const state = 'LUULUUBFLBLLBRRURRRRURFUFFFRDRDDDDDDFFULLULLDFFDBBBBBB'; // 已完成十字 + BL/BR 两组
    const saved = { mode: vm.trainMode, slotMode: vm.solveSlotMode, slots: vm.selectedSolveSlots, z2: vm.z2On };
    vm.z2On = false;
    vm.solveSlotMode = 'ALL'; vm.trainMode = 'xxxcross';
    const triple = vm.isTrainDone(state);
    vm.trainMode = 'xxcross';
    const double = vm.isTrainDone(state);
    vm.solveSlotMode = 'FIXED'; vm.selectedSolveSlots = ['FR', 'BL'];
    const fixed = vm.isTrainDone(state);
    Object.assign(vm, { trainMode: saved.mode, solveSlotMode: saved.slotMode, selectedSolveSlots: saved.slots, z2On: saved.z2 });
    return { triple, double, fixed };
  });
  if (judged.triple || !judged.double || judged.fixed) throw new Error(`BLE 实时完成判定错误 ${JSON.stringify(judged)}`);
  await page.locator('.ble-recommendation-toolbar button').filter({ hasText: '关闭' }).click();
  await page.locator('[data-ble-compact-toggle]').click();
  if (!(await page.locator('[data-ble-recommend-open]').isVisible())) throw new Error('收纳态未保留推荐入口');
  await page.evaluate(() => { window.__bleCross.showBest = false; window.__bleCross.trainMode = 'xcross'; window.__bleCross.saveTrainMode(); });
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => !window.__bleCross.recommendationBusy, null, { timeout: 180000 });
  const x = await page.evaluate(() => ({ count: window.__bleCross.recommendations.length, error: window.__bleCross.recommendationError }));
  if (!x.count) throw new Error(`XCross 按需推荐异常 ${JSON.stringify(x)}`);
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = 'cross'; vm.saveTrainMode();
    if (!vm.z2On) vm.toggleZ2();
  });
  await page.waitForFunction(() => window.__bleCross.z2On && !window.__bleCross.world.cube.twister.twisting);
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => !window.__bleCross.recommendationBusy, null, { timeout: 180000 });
  const whiteRoutes = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const recommendations = vm.recommendations;
    const views = await vm.analysisClient.request('scoreExisting', { solutions: recommendations.map(item => ({
      moves: item.physicalMoves.map(move => vm.displayMoveWithOps(move, vm.recommendationViewOps)), slots: [],
    })) });
    const mismatched = recommendations.filter(candidate => !views.some(view =>
      view.front === candidate.front && view.solutions.some(item => item.moves.join(' ') === candidate.displayMoves.join(' ') &&
        item.route.score === candidate.route.score &&
        item.route.steps.map(step => step.movement).join(' ') === candidate.route.steps.map(step => step.movement).join(' '))));
    return { count: recommendations.length, mismatched: mismatched.map(item => ({
      id: item.id, front: item.front, score: item.route.score, moves: item.displayMoves.join(' '),
    })) };
  });
  if (!whiteRoutes.count || whiteRoutes.mismatched.length) throw new Error(`白底屏幕指法评分不一致 ${JSON.stringify(whiteRoutes)}`);
  const guard = await page.evaluate(() => {
    const vm = window.__bleCross;
    const state = 'LUULUUBFLBLLBRRURRRRURFUFFFRDRDDDDDDFFULLULLDFFDBBBBBB';
    vm.z2On = false; vm.solveSlotMode = 'ALL';
    vm.trainMode = 'xxxcross'; vm.startSolving(state);
    const triple = vm.needBreak;
    vm.trainMode = 'xxcross'; vm.startSolving(state);
    return { triple, double: vm.needBreak };
  });
  if (guard.triple || !guard.double) throw new Error(`起点完成守卫未按完整目标计算 ${JSON.stringify(guard)}`);
  return { cross, x: x.count, xx: xx.count, xxx: xxx.count, judged, whiteRoutes, guard, compact: true };
}
