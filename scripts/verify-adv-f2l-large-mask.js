async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${page.url().split('?')[0]}?mode=advf2l`);
  await page.waitForFunction(() => window.__appShell?.currentView()?.selection);
  const toggle = page.getByRole('checkbox', { name: '大魔方隐藏无关块', exact: true });
  await toggle.uncheck();
  const snapshot = () => page.evaluate(() => {
    const view = window.__appShell.currentView();
    return { step: view.step, state: view.world.cube.serialize(),
      positions: view.world.cube.cubelets.map(piece => piece.initial) };
  });
  const checkMask = () => page.evaluate(() => {
    const view = window.__appShell.currentView();
    const cube = view.world.cube;
    const plan = view.displayPlan;
    for (const piece of cube.initials) for (const sticker of piece.stickers.filter(Boolean)) {
      const hidden = plan.blackCubelets.includes(piece.initial) || (plan.strip[sticker.name] || []).includes(piece.initial);
      if (sticker.visible === hidden) throw new Error(`贴纸遮罩错误：${piece.initial}/${sticker.name}`);
    }
    if (!cube.cubelets.every(piece => piece.visible)) throw new Error('不应隐藏块体');
  });
  await page.getByRole('button', { name: '下一步 ▶', exact: true }).click();
  await page.waitForFunction(() => window.__appShell.currentView().step === 1 && !window.__appShell.currentView().playing);
  const before = await snapshot();
  await toggle.check();
  await checkMask();
  assert(JSON.stringify((await snapshot()).positions) === JSON.stringify(before.positions), '开关不能移动块');
  await toggle.uncheck();
  assert(JSON.stringify(await snapshot()) === JSON.stringify(before), '开关不能重置状态或步数');
  await toggle.check();
  for (let group = 0; group < 3; group++) {
    await page.locator('.adv-f2l-groups button').nth(group).click();
    for (let direction = 0; direction < 4; direction++) {
      await page.locator('.adv-f2l-directions button').nth(direction).click();
      for (const flipped of [false, true]) {
        await page.getByRole('checkbox', { name: 'z2', exact: true }).setChecked(flipped);
        if (await page.locator('.adv-f2l-variants button').count() > 1)
          await page.locator('.adv-f2l-variants button').last().click();
        await checkMask();
      }
    }
  }
  await page.reload();
  await page.waitForFunction(() => window.__appShell?.currentView()?.selection);
  assert(await toggle.isChecked(), '刷新后应记住配置');
  await checkMask();
  await page.getByRole('button', { name: '▶ 播放', exact: true }).click();
  await page.waitForFunction(() => {
    const view = window.__appShell.currentView();
    return !view.playing && view.step === view.currentMoves.length;
  });
  await checkMask();
  await toggle.uncheck();
  await page.getByRole('button', { name: '⏮ 回到起点', exact: true }).click();
  assert(errors.length === 0, errors.join('\n'));
  return '大魔方遮罩：开关、播放进度、三分类四位置、z2、多解法、刷新记忆均通过';
}
