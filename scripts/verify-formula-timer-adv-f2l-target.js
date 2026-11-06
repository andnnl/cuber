async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto(`${page.url().split('?')[0]}?mode=formulatimer`);
  await page.locator('.formula-timer-root').waitFor();
  const backup = await page.evaluate(() => localStorage.getItem('formulaTimer.v1'));
  const results = [];
  try {
    for (const input of ['screen', 'physical']) {
      const initial = await page.evaluate(() => {
        const vm = window.__appShell.currentView();
        vm.settings.preload = false;
        vm.settings.hideUnrelated = false;
        vm.clearNextJob();
        const item = vm.items.find(item => item.id === 'advf2l:3534:0:4069');
        const simulator = new vm.displayCube.constructor(3);
        simulator.twister.setup("S R S'");
        vm.showCase({...item, targetSlot:'FR', scramble:"S R S'", initialFacelets:simulator.serialize()});
        return {target:vm.current.targetSlot, records:vm.records.length};
      });
      assert(initial.target === 'BR', '旧题目 FR 元数据应纠正成角块真实的 BR 目标');
      const setState = async moves => page.evaluate(moves => {
        const vm = window.__appShell.currentView();
        vm.resetCase();
        vm.world.cube.twister.setup(moves);
        vm.displayCube.twister.setup(moves);
      }, moves);
      const turn = async () => {
        if (input === 'screen') {
          await page.locator('[aria-label="可操作的训练魔方"]').focus();
          await page.keyboard.press('u');
        } else {
          await page.evaluate(() => window.__appShell.currentView().playRecoveredMoves([{move:'U', at:Date.now()}], true));
        }
        await page.evaluate(() => window.__appShell.currentView().world.cube.twister.finish());
        await page.waitForTimeout(180);
      };
      await setState("R' U' R");
      await turn();
      assert(await page.evaluate(() => window.__appShell.currentView().records.length) === initial.records,
        `${input} 仅修好角块原位置 FR、实际目标 BR 未完成时不得成功`);
      await setState("R U R'");
      await turn();
      const result = await page.evaluate(() => {
        const vm = window.__appShell.currentView();
        vm.clearNextJob();
        return {count:vm.records.length, record:vm.records[0]};
      });
      assert(result.count === initial.records + 1 && result.record.result === 'success' && result.record.targetSlot === 'BR',
        `${input} 实际 BR 已完成、原位置 FR 未完成也应成功：${JSON.stringify(result)}`);
      results.push({input, target:result.record.targetSlot, result:result.record.result});
    }
    return {targetCornerRegression:results};
  } finally {
    await page.evaluate(backup => {
      window.__appShell.currentView().clearNextJob();
      if (backup === null) localStorage.removeItem('formulaTimer.v1');
      else localStorage.setItem('formulaTimer.v1', backup);
    }, backup);
    await page.reload();
  }
}
