async page => {
  const failures = [];
  const assert = (condition, message) => { if (!condition) failures.push(message); };
  await page.goto(`http://127.0.0.1:18115/?mode=formulatimer&layoutcheck=${Date.now()}`);
  await page.locator('.formula-timer-root').waitFor();
  await page.evaluate(async () => {
    const view = window.__appShell.currentView();
    view.settings.preload = true;
    view.settings.mirrorCube = true;
    view.changePreloadMode();
    const at = new Date(2026, 0, 2, 12, 34, 56).getTime();
    view.records = ['success', 'idle-failure', 'interrupted'].map((result, index) => ({
      ...view.current, at:at + index * 1000, result, reactionMs:560, durationMs:1234, moveCount:6
    }));
    await view.$nextTick();
  });
  await page.waitForFunction(() => !!window.__appShell.currentView().nextCube);
  const records = page.locator('details').filter({has:page.locator('summary', {hasText:'训练记录'})});
  await records.evaluate(element => { element.open = true; });
  const table = records.locator('table');
  assert(await table.count() === 1, '训练记录应使用表格');
  if (await table.count()) {
    assert(await table.locator('thead th').count() === 8, '表格应包含八列');
    assert(await table.locator('tbody tr').count() === 3, '应显示三条记录');
    assert(await table.locator('tbody tr').first().locator('td').first().innerText() === '12:34:56', '时间只显示时分秒');
    await records.locator('select').selectOption('success');
    assert(await table.locator('tbody tr').count() === 1, '结果筛选应保留');
    await records.locator('select').selectOption('all');
  }
  const layouts = [];
  for (const width of [320, 390, 600, 601, 768, 1024]) {
    await page.setViewportSize({width, height:820});
    for (const mode of ['alternate', 'fixed-left']) {
      for (const side of mode === 'alternate' ? [0, 1] : [0]) {
        await page.evaluate(async ({mode, side}) => {
          const view = window.__appShell.currentView();
          view.settings.preloadLayout = mode;
          view.activeSide = side;
          await view.$nextTick();
          view.resize();
        }, {mode, side});
        const current = await page.locator('.formula-timer-current').boundingBox();
        const next = await page.locator('.formula-timer-next').boundingBox();
        const stacked = width <= 600;
        assert(stacked ? Math.abs(current.x - next.x) < 2 : Math.abs(current.y - next.y) < 2, `${width}/${mode}/${side}：排列方向错误`);
        assert(stacked ? (side ? current.y > next.y : current.y < next.y) : (side ? current.x > next.x : current.x < next.x), `${width}/${mode}/${side}：顺序错误`);
        if (stacked) assert(current.width > width * 0.85 && current.height >= 280, `${width}：手机魔方应足够大`);
        const dimensions = await page.locator('.formula-timer-current .formula-timer-render').evaluate(element => {
          const canvas = element.querySelector('canvas');
          return {width:element.clientWidth, height:element.clientHeight, canvasWidth:parseFloat(canvas.style.width), canvasHeight:parseFloat(canvas.style.height)};
        });
        assert(Math.abs(dimensions.width - dimensions.canvasWidth) < 2 && Math.abs(dimensions.height - dimensions.canvasHeight) < 2, `${width}：画布应跟随容器尺寸`);
        assert(await page.locator('.formula-timer-mirror canvas').count() === 2, '当前与下一题均应保留镜像');
        layouts.push({width, mode, side, current, next});
      }
    }
    assert(await page.locator('.formula-timer-root').evaluate(element => element.scrollWidth <= element.clientWidth + 1), `${width}：训练页不得横向溢出`);
    if (await table.count() && width === 320) {
      assert(await page.locator('.formula-timer-record-table-wrap').evaluate(element => element.scrollWidth > element.clientWidth && getComputedStyle(element).overflowX === 'auto'), '手机表格应能独立横向滚动');
    }
  }
  if (await table.count()) {
    await records.locator('select').selectOption('success');
    await table.locator('button').click();
    assert(await page.evaluate(() => !!window.__appShell.currentView().replayRecord), '复盘题面应保留');
    await page.evaluate(async () => {
      const view = window.__appShell.currentView();
      view.recordResult = 'all';
      view.records = [];
      await view.$nextTick();
    });
    assert(await table.locator('tbody td[colspan="8"]').count() === 1, '空记录应显示提示行');
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return {passed:true, layouts:layouts.length, records:'表格、时间、筛选、复盘、空状态、横向滚动'};
}
