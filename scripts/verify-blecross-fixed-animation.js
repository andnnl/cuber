async page => {
  await page.goto(`http://127.0.0.1:18083/?mode=blecross&verify=${Date.now()}`);
  await page.waitForFunction(() => window.__bleCross?.world);
  const original = await page.evaluate(() => window.__bleCross.world.cube.serialize());
  await page.locator('[data-ble-fixed-open]').click();
  await page.waitForFunction(() => window.__bleCross.fixedCases?.selected);
  const controls = page.locator('.ble-fixed-controls button');
  const expected = ['返回起点', '上一步', '下一步', '播放'];
  for (let i = 0; i < expected.length; i++) {
    if (await controls.nth(i).getAttribute('title') !== expected[i]) throw new Error(`控制按钮 ${i} 图标标题不统一`);
  }
  if ((await controls.allTextContents()).map(text => text.trim()).join(',') !== '⏪,⏮,⏭,▶') {
    throw new Error('固定案例按钮图标与指法推荐不一致');
  }
  await controls.nth(2).click();
  const forward = await page.evaluate(() => ({ step:window.__bleCross.fixedCases.step, playing:window.__bleCross.fixedCases.playing }));
  if (forward.step !== 0 || !forward.playing) throw new Error(`下一步未等待动画完成：${JSON.stringify(forward)}`);
  await page.waitForFunction(() => window.__bleCross.fixedCases.step === 1 && !window.__bleCross.fixedCases.playing);
  await controls.nth(1).click();
  const backward = await page.evaluate(() => ({ step:window.__bleCross.fixedCases.step, playing:window.__bleCross.fixedCases.playing }));
  if (backward.step !== 1 || !backward.playing) throw new Error(`上一步未等待逆向动画完成：${JSON.stringify(backward)}`);
  await page.waitForFunction(() => window.__bleCross.fixedCases.step === 0 && !window.__bleCross.fixedCases.playing);
  await controls.nth(3).click();
  await page.waitForFunction(() => { const c=window.__bleCross.fixedCases; return c.step===c.selected.moves.length && !c.playing; });
  if (!(await page.evaluate(() => window.__bleCross.fixedCases.world.cube.complete))) throw new Error('播放未回到还原状态');
  await controls.nth(0).click();
  if (!(await page.evaluate(() => window.__bleCross.fixedCases.step === 0))) throw new Error('起点未重置进度');
  await page.locator('.ble-fixed-tabs button').last().click();
  await page.locator('.ble-fixed-list button').first().click();
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('.ble-fixed-controls button');
    buttons[2].click();
    buttons[2].click();
  });
  await page.waitForFunction(() => window.__bleCross.fixedCases.step === 1 && !window.__bleCross.fixedCases.playing);
  if (await page.evaluate(() => window.__bleCross.fixedCases.step) !== 1) throw new Error('连续点击使扩展记号跨过一帧');
  await controls.nth(1).click();
  await page.waitForFunction(() => window.__bleCross.fixedCases.step === 0 && !window.__bleCross.fixedCases.playing);
  await controls.nth(3).click();
  await page.waitForFunction(() => { const c=window.__bleCross.fixedCases; return c.step===c.selected.moves.length && !c.playing; });
  if (!(await page.evaluate(() => window.__bleCross.fixedCases.world.cube.complete))) throw new Error('含整体转动的公式播放未还原');
  await page.locator('.ble-fixed-top button').click();
  if (await page.evaluate(() => window.__bleCross.world.cube.serialize()) !== original) throw new Error('案例动画影响主场景');
  return '固定案例图标、正反单步动画、播放及主场景隔离通过';
}
