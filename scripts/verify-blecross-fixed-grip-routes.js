async page => {
  await page.goto(`http://127.0.0.1:18083/?mode=blecross&verify=${Date.now()}`);
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.locator('[data-ble-fixed-open]').click();
  await page.waitForFunction(() => {
    const c = window.__bleCross.fixedCases;
    return c && !c.scoring && (c.routes.length || c.error);
  });
  const routes = await page.locator('[data-ble-fixed-grip-route]').count();
  if (routes < 2 || routes > 4) throw new Error(`同一公式应提供 2~4 条实际指法路线，目前 ${routes}`);
  const before = await page.evaluate(() => {
    const c = window.__bleCross.fixedCases;
    return { cube:c.world.cube.serialize(), step:c.step, instructions:c.instructions, score:c.route.score, start:c.route.start_left + c.route.start_right };
  });
  await page.locator('[data-ble-fixed-grip-route]').nth(1).click();
  const after = await page.evaluate(() => {
    const c = window.__bleCross.fixedCases;
    return { cube:c.world.cube.serialize(), step:c.step, instructions:c.instructions, score:c.route.score, start:c.route.start_left + c.route.start_right };
  });
  if (before.cube !== after.cube || before.step !== after.step ||
      JSON.stringify(before.instructions) === JSON.stringify(after.instructions) && before.start === after.start) {
    throw new Error(`切换指法没有更新提示，或改动了案例：${JSON.stringify({before,after})}`);
  }
  await page.locator('.ble-fixed-grip-switch button').last().click();
  const full = await page.evaluate(() => window.__bleCross.fixedCases.instructions[0]);
  if (!full.includes('动作后')) throw new Error('完整版指法未随当前路线更新');
  await page.locator('.ble-fixed-controls button').last().click();
  await page.waitForFunction(() => {
    const c = window.__bleCross.fixedCases;
    return c.step === c.selected.moves.length && !c.playing;
  });
  if (!(await page.evaluate(() => window.__bleCross.fixedCases.world.cube.complete))) throw new Error('切换路线影响了原公式播放');
  await page.locator('.ble-fixed-tabs button').last().click();
  await page.locator('.ble-fixed-list button').first().click();
  if (await page.locator('[data-ble-fixed-grip-route]').count() !== 0) throw new Error('扩展记号展示了虚构路线');
  return { routes, switching:'independent', extended:'hints only' };
}
