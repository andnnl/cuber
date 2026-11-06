async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = page.url().split('?')[0];
  await page.goto(`${base}?mode=formulatimer`);
  await page.locator('.formula-timer-root').waitFor();
  const backup = await page.evaluate(() => ['formulaTimer.v1', 'formulaTimer.stats.v1']
    .map(key => [key, window.localStorage.getItem(key)]));
  try {
    await page.evaluate(async () => { await window.__appShell.disconnect(); });
    await page.locator('.formula-timer-root .v-btn--fab').click();
    await page.locator('.setting-mode-button').filter({hasText:'非标F2L'}).click();
    await page.locator('.adv-f2l-root').waitFor();
    assert(page.url().includes('mode=advf2l'), '菜单没有导航至非标公式库');
    await page.goBack();
    await page.locator('.formula-timer-root').waitFor();
    await page.getByRole('button', {name:'F2L 非标', exact:true}).click();
    const pool = await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      vm.settings.preload = false;
      vm.settings.beforeZ2 = false;
      vm.settings.beforeY = '';
      vm.settings.randomU = false;
      vm.settings.nextMode = 'repeat';
      return { count:vm.categoryItems.length, invalid:vm.invalidItems, id:vm.categoryItems[0].id };
    });
    assert(pool.count === 598 && pool.invalid.length === 0, '非标题池不完整或有无效题面');
    await page.getByRole('button', {name:'选择公式', exact:true}).click();
    const choices = page.locator('[data-formula-choice]');
    assert(await choices.count() === 598, '公式选择器没有展示全部解法');
    await choices.first().locator('img.formula-timer-f2l-picture').waitFor();
    assert(await choices.first().locator('img').evaluate(image => image.complete && image.naturalWidth === 256),
      '非标题面应使用公式库同款 3D 图标');
    await page.getByRole('button', {name:'取消选择', exact:true}).click();
    await choices.first().click();
    await page.getByRole('button', {name:'完成', exact:true}).click();
    const before = await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      return { id:vm.current.id, formula:vm.current.formula, count:vm.records.length,
        selected:vm.settings.selectedIds.advf2l.slice() };
    });
    assert(before.id === pool.id && before.selected.length === 1, '选题未应用到训练');
    assert(before.formula === "S R' S'", '首个非标公式与原公式库不一致');
    const keys = page.locator('[aria-label="可操作的训练魔方"]');
    await keys.focus();
    for (const key of ['s', 'Shift+r', 'Shift+s']) await page.keyboard.press(key);
    await page.waitForFunction(count => window.__appShell.currentView().records.length > count, before.count);
    const completed = await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      vm.clearNextJob();
      return vm.records[0];
    });
    assert(completed.category === 'advf2l' && completed.result === 'success' && completed.moveCount === 3,
      '非标公式没有正常计时完成或计步错误');
    await page.getByRole('button', {name:'统计', exact:true}).click();
    await page.locator('.formula-stats-filters select').first().selectOption('advf2l');
    const stats = await page.evaluate(() => window.__appShell.currentView().statsResult);
    assert(stats.formulas.some(row => row.id === pool.id && row.successCount > 0), '统计没有包含非标训练成绩');
    await page.reload();
    await page.locator('.formula-timer-root').waitFor();
    const persisted = await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      return { category:vm.settings.category, selected:vm.settings.selectedIds.advf2l,
        stats:vm.statsPreferences.category, current:vm.current?.id };
    });
    assert(persisted.category === 'advf2l' && persisted.stats === 'advf2l' &&
      persisted.selected[0] === pool.id && persisted.current === pool.id, '刷新丢失非标设置或当前选题');
    await page.locator('[data-formula-preload]').check();
    await page.waitForFunction(() => {
      const vm = window.__appShell.currentView();
      return vm.queuedCase?.category === 'advf2l' && !!vm.nextCube;
    });
    await page.setViewportSize({width:390, height:844});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflow, '手机布局横向溢出');
    assert(errors.length === 0, `页面异常：${errors.join('; ')}`);
    return {menu:'passed', cases:54, formulas:pool.count, keyboard:completed.result,
      moves:completed.moveCount, stats:'passed', persistence:'passed', preload:'passed', mobile:'passed'};
  } finally {
    await page.evaluate(backup => {
      const vm = window.__appShell.currentView();
      vm.clearNextJob?.();
      for (const [key, value] of backup) {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      }
    }, backup);
    await page.setViewportSize({width:1280, height:900});
    await page.reload();
  }
}
