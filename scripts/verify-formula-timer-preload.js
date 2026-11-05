async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.evaluate(() => window.localStorage.removeItem('formulaTimer.v1'));
  await page.reload();
  await page.locator('.formula-timer-root').waitFor();
  const checkbox = page.locator('[data-formula-preload]');
  await checkbox.check();
  await page.waitForFunction(() => !!window.__appShell.currentView().nextCube);
  const prepare = async layout => page.evaluate(layout => {
    const vm = window.__appShell.currentView();
    vm.clearNextJob();
    vm.settings.preloadLayout = layout;
    vm.changePreloadLayout();
    vm.settings.nextMode = 'repeat';
    vm.world.cube.twister.setup("R'");
    const first = {id:'pll:preload-r', category:'pll', name:'R 测试', formula:'R',
      scramble:"R'", initialFacelets:vm.world.cube.serialize()};
    vm.world.cube.twister.setup("U'");
    const next = {id:'pll:preload-u', category:'pll', name:'U 测试', formula:'U',
      scramble:"U'", initialFacelets:vm.world.cube.serialize()};
    vm.showCase(first);
    vm.queuedCase = next;
    return vm.records.length;
  }, layout);
  const snapshot = () => page.evaluate(() => {
    const vm = window.__appShell.currentView();
    return {side:vm.activeSide, id:vm.current.id, scramble:vm.current.scramble,
      queued:vm.queuedCase.initialFacelets, preview:vm.nextCube.world.cube.serialize(),
      state:vm.displayCube.serialize(), records:vm.records.length, nextJob:vm.nextJob,
      moves:vm.training.moveCount, started:vm.training.startedAt, completed:vm.completedRecord};
  });
  const keys = page.locator('[aria-label="可操作的训练魔方"]');
  for (const layout of ['alternate', 'fixed-left']) {
    const count = await prepare(layout);
    await page.waitForFunction(() => {
      const vm = window.__appShell.currentView();
      return vm.nextCube.world.cube.serialize() === vm.queuedCase.initialFacelets;
    });
    const before = await snapshot();
    await page.evaluate(() => window.__appShell.currentView().resetCase());
    assert((await snapshot()).queued === before.queued, '重试更换了已预览题');
    const previewBox = await page.locator('.formula-timer-next canvas').boundingBox();
    assert(previewBox && previewBox.width > 0 && previewBox.height > 0, '预览尺寸无效');
    await page.mouse.move(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(previewBox.x + 10, previewBox.y + 10, {steps:8});
    await page.mouse.up();
    const afterDrag = await snapshot();
    assert(afterDrag.state === before.state && afterDrag.started === null && afterDrag.preview === before.preview, '预览响应了操作');
    await keys.focus();
    await page.keyboard.press('r');
    await page.waitForFunction(count => window.__appShell.currentView().records.length === count + 1, count);
    const after = await snapshot();
    assert(after.id === 'pll:preload-u' && after.state === before.queued, '未激活精确的预览题');
    assert(after.side === (layout === 'alternate' ? 1 : 0), '布局切换错误');
    assert(after.nextJob === null && after.started === null && after.completed === null && after.moves === 0, '新题计时未重置或保留延迟');
    const currentBox = await page.locator('.formula-timer-current').boundingBox();
    const nextBox = await page.locator('.formula-timer-next').boundingBox();
    assert(layout === 'alternate' ? currentBox.x > nextBox.x : currentBox.x < nextBox.x, '视觉顺序不符');
    await keys.focus();
    await page.keyboard.press('u');
    await page.waitForFunction(count => window.__appShell.currentView().records.length === count + 2, count);
    assert((await snapshot()).side === 0, '第二次连续完成后位置错误');
  }
  await page.evaluate(async () => { await window.__appShell.connect('mock'); });
  const physicalCount = await prepare('alternate');
  await page.evaluate(() => {
    window.__cubeSession.mockApplyFormula('R');
    window.__cubeSession.mockApplyFormula('U');
  });
  await page.waitForFunction(count => window.__appShell.currentView().records.length === count + 2, physicalCount);
  const physical = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    return {records:vm.records.slice(0,2).map(record => ({result:record.result, moves:record.moveCount})),
      moves:vm.training.moveCount, started:vm.training.startedAt};
  });
  assert(physical.records.every(record => record.result === 'success' && record.moves === 1), '连续实体输入丢步或重复');
  assert(physical.moves === 0 && physical.started === null, '实体切题污染了下一题计时');
  await page.evaluate(async () => { await window.__appShell.disconnect(); });
  await page.setViewportSize({width:390, height:844});
  await page.evaluate(() => window.__appShell.currentView().resize());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '移动端横向溢出');
  for (const selector of ['.formula-timer-current canvas', '.formula-timer-next canvas']) {
    const bounds = await page.locator(selector).boundingBox();
    assert(bounds && bounds.width > 0 && bounds.height > 0 && bounds.x + bounds.width <= 390, '移动端魔方不可见');
  }
  await page.locator('[data-formula-preload-layout]').selectOption('fixed-left');
  await page.reload();
  await page.locator('.formula-timer-next canvas').waitFor();
  assert(await checkbox.isChecked(), '开关未持久化');
  assert(await page.locator('[data-formula-preload-layout]').inputValue() === 'fixed-left', '布局未持久化');
  await page.getByRole('button', {name:'统计', exact:true}).click();
  assert(await page.locator('.formula-timer-next').count() === 0, '统计页面仍展示预览');
  await page.getByRole('button', {name:'返回训练', exact:true}).click();
  await checkbox.uncheck();
  assert(await page.locator('.formula-timer-cube canvas').count() === 1, '普通模式未恢复单魔方');
  return {layouts:['alternate','fixed-left'], preview:'readonly and exact', keyboard:'two consecutive successes',
    physical, mobile:'no overflow', persistence:'passed', normal:'one cube'};
}
