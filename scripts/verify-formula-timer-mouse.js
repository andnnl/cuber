async page => {
  await page.goto('http://127.0.0.1:18083/?mode=formulatimer');
  const canvas = page.locator('.formula-timer-cube canvas');
  const box = await canvas.boundingBox();
  if (!box) throw Error('公式计时魔方画布未显示');
  const hits = [];
  for (const [name, vertical, expected] of [['top', .2, '0,1,0'], ['front', .55, '0,0,1']]) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height * vertical;
    await page.mouse.move(x, y);
    await page.mouse.down();
    const hit = await page.evaluate(() => {
      const c = window.__appShell['$refs'].activeView.world.controller;
      return { index: c.holder.index, normal: c.holder.plane?.normal.toArray().join(',') };
    });
    await page.mouse.up();
    if (hit.index < 0 || hit.normal !== expected) throw Error(`${name} 面鼠标命中错误: ${JSON.stringify(hit)}`);
    hits.push({ name, hit });
  }
  const moves = [];
  for (const [name, vertical, horizontal] of [
    ['U', .55, -85],
    ["U'", .55, 85],
    ["F'", .38, -85],
  ]) {
    await page.goto('http://127.0.0.1:18083/?mode=formulatimer');
    const bounds = await page.locator('.formula-timer-cube canvas').boundingBox();
    if (!bounds) throw Error('公式计时魔方画布未显示');
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height * vertical;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + horizontal, y, { steps: 10 });
    await page.mouse.up();
    const move = await page.evaluate(() => window.__appShell.$refs.activeView.world.cube.history.last?.value);
    if (move !== name) {
      throw Error(`${name} 鼠标拖动未产生预期转动: ${move}`);
    }
    moves.push(move);
  }
  return { hits, moves };
}
