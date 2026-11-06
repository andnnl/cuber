async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${page.url().split('?')[0]}?mode=formulatimer`);
  await page.locator('.formula-timer-root').waitFor();
  const backup = await page.evaluate(() => localStorage.getItem('formulaTimer.v1'));
  try {
    await page.getByRole('button', {name:'F2L 非标', exact:true}).click();
    await page.evaluate(() => {
      const view = window.__appShell.currentView();
      view.settings.selectedIds.advf2l = [view.categoryItems[0].id];
      view.settings.randomU = false;
      view.settings.beforeZ2 = false;
      view.settings.beforeY = '';
      view.settings.nextMode = 'repeat';
      view.nextCase();
    });
    await page.getByRole('button', {name:'选择公式', exact:true}).click();
    const first = page.locator('[data-formula-choice]').first().locator('img');
    await first.waitFor();
    assert(await first.evaluate(image => image.complete && image.naturalWidth === 256), '未使用 256px 三维图标');
    await page.getByRole('button', {name:'完成', exact:true}).click();
    const toggle = page.getByRole('checkbox', {name:'大魔方隐藏无关块（变黑）', exact:true});
    await toggle.uncheck();
    const baseline = await page.evaluate(() => window.__appShell.currentView().world.cube.serialize());
    await toggle.check();
    const masked = await page.evaluate(() => {
      const view = window.__appShell.currentView();
      const cube = view.world.cube;
      return {black:view.displayMask.blackCubelets,
        protected:[2,5,18,21,0,3].every(index => cube.initials[index].stickers.filter(Boolean).every(sticker => sticker.visible)),
        dark:[20,23].every(index => cube.initials[index].stickers.filter(Boolean).every(sticker => !sticker.visible)),
        allBodies:cube.cubelets.every(piece => piece.visible), logical:view.displayCube.serialize()};
    });
    assert(masked.protected && masked.dark && masked.allBodies && masked.logical === baseline, JSON.stringify(masked));
    await toggle.uncheck();
    assert(await page.evaluate(() => window.__appShell.currentView().world.cube.serialize()) === baseline, '关闭遮罩改变了题面');
    await toggle.check();
    await page.locator('[data-formula-preload]').check();
    await page.waitForFunction(() => !!window.__appShell.currentView().nextCube);
    const nextMasked = await page.evaluate(() => {
      const view = window.__appShell.currentView();
      return view.nextCube.world.cube.initials[20].stickers.filter(Boolean).every(sticker => !sticker.visible);
    });
    assert(nextMasked, '下一题未同步遮罩');
    const count = await page.evaluate(() => window.__appShell.currentView().records.length);
    await page.locator('.formula-timer-render[tabindex]').focus();
    await page.keyboard.press('s');
    const inProgress = () => page.evaluate(() => {
      const view = window.__appShell.currentView();
      return {started:view.training.startedAt, moves:view.training.moveCount, state:view.displayCube.serialize()};
    });
    const started = await inProgress();
    await toggle.uncheck();
    await toggle.check();
    assert(JSON.stringify(await inProgress()) === JSON.stringify(started), '切换遮罩不应重置正在进行的计时或动作');
    await page.locator('.formula-timer-render[tabindex]').focus();
    for (const key of ['Shift+r', 'Shift+s']) await page.keyboard.press(key);
    await page.waitForFunction(count => window.__appShell.currentView().records.length > count, count);
    assert(await page.evaluate(() => window.__appShell.currentView().records[0].result === 'success'), '隐藏后无法正常结算');
    await page.reload();
    await page.locator('.formula-timer-root').waitFor();
    assert(await toggle.isChecked(), '刷新未记住开关');
    await page.getByRole('button', {name:'OLL', exact:true}).click();
    assert(await page.evaluate(() => !window.__appShell.currentView().world.cube.serialize().includes('?')), 'OLL 不应套用 F2L 遮罩');
    assert(errors.length === 0, errors.join('\n'));
    return '公式计时：新图标、目标角棱/完成槽保护、开关恢复、下一题、隐藏时计时结算、设置记忆通过';
  } finally {
    await page.evaluate(value => {
      const view = window.__appShell.currentView();
      view.clearNextJob();
      if (value === null) localStorage.removeItem('formulaTimer.v1');
      else localStorage.setItem('formulaTimer.v1', value);
    }, backup);
    await page.reload();
  }
}
