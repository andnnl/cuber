async page => {
  await page.goto('http://127.0.0.1:18082/?mode=formulatimer');
  await page.locator('.formula-timer-root').waitFor({ timeout: 10000 });
  if (await page.locator('.formula-timer-cube canvas').count() < 1) throw Error('缺少 3D 魔方');
  if (await page.locator('[data-formula-timer-clock]').count() !== 1) throw Error('缺少计时器');
  await page.getByRole('button', { name: '选择公式' }).click();
  if (await page.locator('[data-formula-choice]').count() < 41) throw Error('公式列表不完整');
  await page.getByRole('button', { name: '取消选择' }).click();
  const choiceBoxes = page.locator('[data-formula-choice]');
  await choiceBoxes.nth(0).hover();
  await page.mouse.down();
  await choiceBoxes.nth(1).hover();
  await page.mouse.up();
  if (!await choiceBoxes.nth(0).evaluate(el => el.classList.contains('active')) ||
      !await choiceBoxes.nth(1).evaluate(el => el.classList.contains('active'))) throw Error('鼠标划选公式失败');
  await page.getByRole('button', { name: '全选' }).click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.getByRole('button', { name: 'OLL', exact: true }).click();
  await page.getByRole('button', { name: '选择公式' }).click();
  if (await page.locator('.formula-timer-oll-preview').count() < 57) throw Error('OLL 缺少与无缝 OP 一致的平面图预览');
  await page.getByRole('button', { name: '自定义 OLL' }).click();
  await page.getByRole('button', { name: '内置 OLL' }).click();
  await page.getByRole('button', { name: '取消选择' }).click();
  const firstChoice = page.locator('[data-formula-choice]').first();
  await firstChoice.waitFor();
  const beforeTouch = await firstChoice.evaluate(el => el.classList.contains('active'));
  await page.evaluate(async () => {
    await window.__appShell.currentView().$nextTick();
    const choice = document.querySelector('[data-formula-choice]');
    choice.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    choice.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    await window.__appShell.currentView().$nextTick();
  });
  if (await firstChoice.evaluate(el => el.classList.contains('active')) === beforeTouch) throw Error('手机短按公式卡片未切换');
  await page.evaluate(async () => {
    const view = window.__appShell.currentView();
    const choice = document.querySelector('[data-formula-choice]');
    choice.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 420));
    if (!view.paint) throw Error('长按没有进入划选模式');
    choice.dispatchEvent(new TouchEvent('touchend', { bubbles: true }));
    if (view.paint || view.touchName) throw Error('长按结束没有清除划选状态');
  });
  await page.getByRole('button', { name: '完成' }).click();
  const ollCase = await page.evaluate(() => {
    const view = window.__appShell.currentView();
    return { ...view.current, shown: view.world.cube.serialize() };
  });
  if (!ollCase.scramble || ollCase.shown !== ollCase.initialFacelets || !await page.locator('.formula-timer-scramble').isVisible())
    throw Error('OLL 题面没有使用并显示实际打乱串');
  await page.getByRole('button', { name: '重试同题' }).click();
  if (!await page.evaluate(scramble => window.__appShell.currentView().current.scramble === scramble, ollCase.scramble))
    throw Error('重复 OLL 题面时打乱发生变化');
  await page.getByRole('button', { name: 'PLL', exact: true }).click();
  if (!await page.evaluate(() => {
    const view = window.__appShell.currentView();
    return view.current.scramble && view.current.initialFacelets === view.world.cube.serialize();
  })) throw Error('PLL 题面与打乱串不一致');
  await page.getByRole('button', { name: 'F2L', exact: true }).click();
  await page.reload();
  await page.locator('.formula-timer-root').waitFor();
  await page.locator('[data-global-connect]').click();
  await page.getByRole('button', { name: '连接模拟魔方（演示）' }).click();
  await page.waitForFunction(() => window.__cubeSession?.snapshot.status === 'connected');
  await page.evaluate(() => window.__cubeSession.mockApplyFormula('R'));
  await page.waitForFunction(() => window.__appShell?.currentView()?.training.startedAt !== null, null, { timeout: 900 });
  await page.waitForFunction(() => {
    const view = window.__appShell?.currentView();
    return view?.current && view.world.cube.serialize() !== view.current.initialFacelets;
  }, null, { timeout: 900 });
  await page.evaluate(() => window.__cubeSession.mockApplyFormula("R'"));
  await page.waitForFunction(() => window.__appShell?.currentView()?.records.some(record => record.result === 'success'), null, { timeout: 1000 });
  await page.waitForFunction(() => window.__appShell?.currentView()?.training.current !== null, null, { timeout: 1600 });
  await page.evaluate(() => window.__cubeSession.mockApplyFormula('R'));
  await page.waitForFunction(() => window.__appShell?.currentView()?.records.some(record => record.result === 'idle-failure'), null, { timeout: 2200 });
  await page.waitForFunction(() => window.__appShell?.currentView()?.training.current !== null, null, { timeout: 1600 });
  await page.evaluate(() => {
    const view = window.__appShell.currentView();
    view.onSessionSnapshot({ ...view.snapshot, status: 'disconnected' });
    view.onSessionSnapshot({ ...view.snapshot, status: 'connected' });
  });
  if (!await page.evaluate(() => window.__appShell.currentView().training.current !== null)) throw Error('断线重连后没有恢复待练状态');
  await page.locator('.formula-timer-details').nth(1).locator('summary').click();
  await page.getByRole('button', { name: '复盘题面' }).first().click();
  const replay = await page.evaluate(() => {
    const view = window.__appShell.currentView();
    return view.replayRecord && view.world.cube.serialize() === view.replayRecord.initialFacelets && view.training.current?.id === view.replayRecord.id;
  });
  if (!replay) throw Error('复盘没有恢复记录的起始题面');
  await page.getByRole('button', { name: '退出复盘' }).click();
  return { url: page.url(), records: await page.evaluate(() => window.__appShell.currentView().records.length) };
}
