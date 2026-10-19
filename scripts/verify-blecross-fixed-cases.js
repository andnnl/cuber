async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross?.world);
  const original = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { cube: vm.world.cube.serialize(), phase: vm.phase, count: vm.records.length };
  });
  await page.locator('[data-ble-fixed-open]').click();
  await page.waitForFunction(() => window.__bleCross.fixedCases?.cases.length === 51);
  if (await page.locator('.ble-fixed-list button').count() !== 39) throw new Error('普通情况数量不正确');
  await page.waitForFunction(() => !!window.__bleCross.fixedCases.route || !!window.__bleCross.fixedCases.error);
  if (await page.evaluate(() => !!window.__bleCross.fixedCases.error)) throw new Error('普通公式真实评分失败');
  await page.locator('.ble-fixed-controls button').last().click();
  await page.waitForFunction(() => window.__bleCross.fixedCases.step === 2, null, { timeout: 10000 });
  if (!(await page.evaluate(() => window.__bleCross.fixedCases.world.cube.complete))) throw new Error('播放完成未还原');
  await page.locator('.ble-fixed-tabs button').last().click();
  if (await page.locator('.ble-fixed-list button').count() !== 12) throw new Error('麻烦情况数量不正确');
  const result = await page.evaluate(() => {
    const vm = window.__bleCross, c = vm.fixedCases, failures = [];
    for (const item of c.cases) {
      c.select(item);
      c.instantTo(item.moves.length);
      if (!c.world.cube.complete) failures.push(item.formula);
    }
    c.select(c.cases.find(item => item.formula === "x U' R U x' R2"));
    return { failures, scoreable: c.selected.scoreable, route: c.route, instructions: c.instructions };
  });
  if (result.failures.length) throw new Error(`案例逆操作不正确：${result.failures.join(', ')}`);
  if (result.scoreable || result.route || !result.instructions[0].includes('整颗')) throw new Error('扩展记号错误地显示分数或缺少提示');
  await page.locator('.ble-fixed-top button').click();
  const after = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { cube: vm.world.cube.serialize(), phase: vm.phase, count: vm.records.length };
  });
  if (JSON.stringify(after) !== JSON.stringify(original)) throw new Error('案例修改了主训练状态');
  return { cases: 51, groups: [39, 12], playback: 'solved', extended: 'hints only', main: 'untouched' };
}
