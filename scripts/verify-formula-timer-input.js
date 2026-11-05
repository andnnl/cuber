async page => {
  await page.goto(`${page.url().split('?')[0]}?mode=formulatimer`);
  await page.locator('.formula-timer-root').waitFor();
  const setCase = async scramble => page.evaluate(scramble => {
    const vm = window.__appShell.currentView();
    vm.clearNextJob();
    vm.feedback = '';
    vm.showCase({id:'pll:input-test', category:'pll', name:'输入测试', formula:'U R', scramble});
    return vm.records.length;
  }, scramble);
  const mouseRecords = await setCase("U'");
  const canvas = page.locator('.formula-timer-cube canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('没有魔方画布');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height * .55;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 85, startY, {steps:10});
  await page.mouse.up();
  await page.waitForFunction(count => window.__appShell.currentView().records.length > count, mouseRecords);
  const mouse = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    return {record:vm.records[0], matches:vm.world.cube.serialize() === vm.displayCube.serialize()};
  });
  if (mouse.record.result !== 'success' || mouse.record.moveCount !== 1 || !mouse.matches)
    throw new Error(`鼠标输入没有完成并计步：${JSON.stringify(mouse)}`);
  const keys = page.locator('[aria-label="可操作的训练魔方"]');
  await setCase("R'");
  await keys.focus();
  await page.keyboard.press('y');
  await page.waitForFunction(() => {
    const vm = window.__appShell.currentView();
    return vm.world.cube.history.last?.sign === 'y' &&
      vm.world.cube.serialize() === vm.displayCube.serialize();
  });
  if (!await page.evaluate(() => window.__appShell.currentView().training.startedAt === null))
    throw new Error('整体转启动了计时');
  await setCase("R'");
  await keys.focus();
  await page.keyboard.press('u');
  await page.keyboard.press('Shift+U');
  const inverse = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    vm.prepareDirectInput();
    return vm.training.moveCount;
  });
  if (inverse !== 2) throw new Error('相邻逆动作被历史合并丢步');
  await page.evaluate(async () => { await window.__appShell.connect('mock'); });
  await page.waitForFunction(() => window.__cubeSession.snapshot.status === 'connected');
  const mixedRecords = await setCase("R' U'");
  await page.evaluate(() => window.__cubeSession.mockApplyFormula('U'));
  await page.waitForFunction(() => window.__appShell.currentView().training.moveCount === 1);
  await keys.focus();
  await page.keyboard.press('r');
  await page.waitForFunction(count => window.__appShell.currentView().records.length > count, mixedRecords);
  const mixed = await page.evaluate(() => window.__appShell.currentView().records[0]);
  if (mixed.result !== 'success' || mixed.moveCount !== 2)
    throw new Error(`实体和屏幕输入混用异常：${JSON.stringify(mixed)}`);
  await setCase("R'");
  await keys.focus();
  await page.keyboard.press('y');
  await page.evaluate(() => window.__appShell.currentView().prepareDirectInput());
  const orientedRecords = await page.evaluate(() => window.__appShell.currentView().records.length);
  await page.evaluate(() => window.__cubeSession.mockApplyFormula('R'));
  await page.waitForFunction(count => window.__appShell.currentView().records.length > count, orientedRecords);
  const oriented = await page.evaluate(() => window.__appShell.currentView().records[0]);
  if (oriented.result !== 'success' || oriented.moveCount !== 1)
    throw new Error(`整体转后实体映射异常：${JSON.stringify(oriented)}`);
  const disconnectRecords = await setCase("R'");
  await keys.focus();
  await page.keyboard.press('u');
  await page.evaluate(async () => { await window.__appShell.disconnect(); });
  if (!await page.evaluate(() => !!window.__appShell.currentView().training.current))
    throw new Error('屏幕训练被无关的蓝牙断开中断');
  await page.keyboard.press('Shift+U');
  await page.keyboard.press('r');
  await page.waitForFunction(count => window.__appShell.currentView().records.length > count, disconnectRecords);
  const touchRecords = await setCase("U'");
  await page.evaluate(async () => {
    const canvas = document.querySelector('.formula-timer-cube canvas');
    const bounds = canvas.getBoundingClientRect();
    const startX = bounds.x + bounds.width / 2;
    const startY = bounds.y + bounds.height * .55;
    const send = (type, clientX) => {
      const touch = new Touch({identifier:1, target:canvas, clientX, clientY:startY});
      canvas.dispatchEvent(new TouchEvent(type, {bubbles:true, cancelable:true,
        changedTouches:[touch], touches:type === 'touchend' ? [] : [touch]}));
    };
    send('touchstart', startX);
    for (let step = 1; step <= 10; step++) {
      send('touchmove', startX - 8.5 * step);
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    send('touchend', startX - 85);
  });
  await page.waitForFunction(count => window.__appShell.currentView().records.length > count, touchRecords);
  const touch = await page.evaluate(() => window.__appShell.currentView().records[0]);
  if (touch.result !== 'success' || touch.moveCount !== 1)
    throw new Error(`触摸输入异常：${JSON.stringify(touch)}`);
  return {mouse:mouse.record.result, keyboardInverse:inverse, mixed:mixed.result,
    mixedMoves:mixed.moveCount, oriented:oriented.result, disconnect:'continues', touch:touch.result};
}
