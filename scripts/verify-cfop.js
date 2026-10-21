async page => {
  const base = 'http://127.0.0.1:18084/';
  await page.goto(`${base}?mode=cfop`);
  await page.waitForSelector('.cfop-panel');
  await page.getByRole('button', {name:'搜索首阶段'}).click();
  await page.waitForFunction(() => !!window.__appShell.currentView().options.length);
  await page.locator('.cfop-option').first().click();
  await page.waitForFunction(() => !!window.__appShell.currentView().route);
  await page.getByRole('button', {name:'一键求解剩余 F2L'}).click();
  await page.waitForFunction(() => window.__appShell.currentView().options.some(item => item.target === 'F2L 全段'),
    null, {timeout:180000});
  await page.locator('.cfop-option').first().click();
  await page.waitForFunction(() => window.__appShell.currentView().route?.segments.length >= 5);
  const labels = await page.locator('.cfop-label').allTextContents();
  if (!labels[0].includes('十字') || !labels.some(label => /第 4 组 F2L ·/.test(label)))
    throw new Error(`公式分行缺少十字或完整四组：${labels}`);

  await page.getByRole('button', {name:'播放', exact:true}).click();
  await page.waitForFunction(() => {
    const vm = window.__appShell.currentView();
    return vm.route && vm.cursor === vm.route.moves.length && !vm.playing;
  }, null, {timeout:30000});
  const replay = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    return {actual:vm.world.cube.serialize(), expected:vm.route.frames[vm.cursor].facelets, error:vm.error};
  });
  if (replay.actual !== replay.expected || replay.error) throw new Error(`三维播放与验证帧不同：${JSON.stringify(replay)}`);
  await page.getByRole('button', {name:'返回起点'}).click();
  await page.evaluate(async () => {
    const shell = window.__appShell;
    await shell.connect('mock');
    shell.session.mockApplyFormula("R U R' F U F'");
  });
  await page.getByRole('button', {name:'开始跟练'}).click();
  await page.waitForFunction(() => window.__appShell.currentView().follow?.status === 'view');
  await page.getByRole('button', {name:/确认持方/}).click();
  await page.evaluate(() => window.__cubeSession.mockApplyFormula('U'));
  await page.waitForFunction(() => window.__appShell.currentView().follow?.status === 'paused');
  const wrong = await page.evaluate(() => window.__appShell.currentView().follow.cursor);
  if (wrong !== 1) throw new Error(`转错推进光标：${wrong}`);
  await page.evaluate(() => window.__cubeSession.mockApplyFormula("U'"));
  await page.waitForFunction(() => window.__appShell.currentView().follow?.status === 'ready');
  await page.setViewportSize({width:390, height:844});
  const layout = await page.evaluate(() => ({
    width:document.documentElement.scrollWidth,
    formula:document.querySelector('.cfop-formula')?.getBoundingClientRect().width,
    cube:document.querySelector('.cfop-cube')?.getBoundingClientRect().height,
  }));
  if (layout.width > 391 || layout.formula < 100 || layout.cube < 250)
    throw new Error(`手机端公式或魔方布局异常：${JSON.stringify(layout)}`);
  return {labels, replay:'ok', correction:'ok', layout};
}
