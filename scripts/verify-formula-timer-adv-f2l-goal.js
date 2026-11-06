async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${page.url().split('?')[0]}?mode=formulatimer`);
  await page.locator('.formula-timer-root').waitFor();
  const backup = await page.evaluate(() => window.localStorage.getItem('formulaTimer.v1'));
  const results = [];
  try {
    await page.evaluate(async () => { await window.__appShell.disconnect(); });
    const keys = page.locator('[aria-label="可操作的训练魔方"]');
    for (const layout of ['alternate', 'fixed-left']) {
      const start = await page.evaluate(layout => {
        const vm = window.__appShell.currentView();
        vm.clearNextJob();
        vm.settings.category = 'advf2l';
        vm.settings.preload = true;
        vm.settings.preloadLayout = layout;
        vm.settings.nextMode = 'repeat';
        const simulator = new vm.displayCube.constructor(3);
        const make = (direction, targetSlot, scramble, formula) => {
          simulator.twister.setup(scramble);
          return {id:`advf2l:1:${direction}:goal-test`, category:'advf2l', name:targetSlot,
            targetSlot, scramble, formula, initialFacelets:simulator.serialize()};
        };
        const first = make(0, 'FR', "L' U' L R U R'", "R U' R'");
        const next = make(1, 'FL', "R U R' L' U' L", "L' U L");
        vm.showCase(first);
        vm.queuedCase = next;
        return {records:vm.records.length, next:next.id};
      }, layout);
      await keys.focus();
      for (const key of ['r', 'Shift+u', 'Shift+r']) await page.keyboard.press(key);
      await page.waitForFunction(count => window.__appShell.currentView().records.length === count + 1, start.records);
      const first = await page.evaluate(() => {
        const vm = window.__appShell.currentView();
        return {record:vm.records[0], next:vm.current.id, side:vm.activeSide};
      });
      assert(first.record.result === 'success' && first.record.moveCount === 3 && first.next === start.next,
        `${layout} 目标槽位已完成但未结算，或未切入第二题`);
      assert(first.side === (layout === 'alternate' ? 1 : 0), `${layout} 预打乱布局错误`);
      await keys.focus();
      for (const key of ['Shift+l', 'u', 'l']) await page.keyboard.press(key);
      await page.waitForFunction(count => window.__appShell.currentView().records.length === count + 2, start.records);
      const second = await page.evaluate(() => {
        const vm = window.__appShell.currentView();
        return {record:vm.records[0], current:vm.current.id};
      });
      assert(second.record.result === 'success' && second.record.moveCount === 3 && second.record.id === start.next,
        `${layout} 第二题仍使用上一题的基线或目标槽位`);
      results.push({layout, first:first.record.result, second:second.record.result});
    }
    assert(errors.length === 0, `页面异常：${errors.join('; ')}`);
    return {partialF2L:'success', independentBaselines:results, errors};
  } finally {
    await page.evaluate(backup => {
      window.__appShell.currentView().clearNextJob();
      if (backup === null) window.localStorage.removeItem('formulaTimer.v1');
      else window.localStorage.setItem('formulaTimer.v1', backup);
    }, backup);
    await page.reload();
  }
}
