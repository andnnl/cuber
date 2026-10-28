async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:18082/?mode=seamlessop&ui-check=destination-${Date.now()}`);
  await page.evaluate(() => localStorage.removeItem('seamlessOpSettings'));
  await page.reload();
  await page.getByLabel('显示线索').check();
  await page.getByLabel('查看全部轨迹').check();
  const faces = page.locator('.op-destination-faces button');
  if (await faces.count() !== 4) throw Error('目的地过滤缺少 L/F/R/B 四按钮');
  for (const face of ['L', 'F', 'R', 'B']) {
    const button = page.getByRole('button', { name: `终点 ${face}`, exact: true });
    if (!await button.getAttribute('aria-pressed') || await button.getAttribute('aria-pressed') !== 'true')
      throw Error(`${face} 面未默认启用`);
  }
  await page.getByLabel('查看全部轨迹').uncheck();
  for (const [windowName, expected] of [['F/R', 'FR'], ['R/B', 'RB'], ['B/L', 'BL'], ['L/F', 'LF']]) {
    await page.locator('.op-window-choice', { hasText: windowName }).click();
    for (const face of ['L', 'F', 'R', 'B']) {
      const pressed = await page.getByRole('button', { name: `终点 ${face}`, exact: true }).getAttribute('aria-pressed');
      if (pressed !== String(expected.includes(face))) throw Error(`${windowName} 未联动终点 ${face}`);
    }
  }
  await page.getByRole('button', { name: '终点 B', exact: true }).click();
  if (await page.getByRole('button', { name: '终点 B', exact: true }).getAttribute('aria-pressed') !== 'true')
    throw Error('窗口联动后不能手动修改终点面');
  await page.locator('.op-window-choice', { hasText: 'F/R' }).click();
  await page.getByLabel('查看全部轨迹').check();
  for (const face of ['L', 'B']) await page.getByRole('button', { name: `终点 ${face}`, exact: true }).click();
  const pickSide = async () => page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    const arrow = view.netArrows.find(item => 'LFRB'.includes('URFDLB'[Math.floor(item.to / 9)]));
    return arrow && 'URFDLB'[Math.floor(arrow.to / 9)];
  });
  let side = await pickSide();
  for (let attempt = 0; !side && attempt < 10; attempt++) {
    await page.getByRole('button', { name: '新题', exact: true }).click();
    side = await pickSide();
  }
  if (!side) throw Error('连续 11 题无侧面目的地，无法验证过滤');
  const before = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { arrows: view.netArrows.map(item => ({ id: item.id, to: item.to })),
      coverage: view.coverage.map(item => item.visibleSources.length),
      colors: [...document.querySelectorAll('.op-net-after .op-net-cell')].map(cell => cell.style.backgroundColor) };
  });
  await page.getByRole('button', { name: `终点 ${side}`, exact: true }).click();
  const after = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { arrows: view.netArrows.map(item => ({ id: item.id, to: item.to })),
      coverage: view.coverage.map(item => item.visibleSources.length),
      colors: [...document.querySelectorAll('.op-net-after .op-net-cell')].map(cell => cell.style.backgroundColor) };
  });
  const expected = before.arrows.filter(item => 'URFDLB'[Math.floor(item.to / 9)] !== side);
  if (JSON.stringify(after.arrows) !== JSON.stringify(expected)) throw Error(`${side} 目的地箭头没有独立过滤`);
  if (JSON.stringify(after.coverage) !== JSON.stringify(before.coverage) ||
      JSON.stringify(after.colors) !== JSON.stringify(before.colors)) throw Error('过滤不应改变六格覆盖或预测配色');
  for (const face of ['L', 'F', 'R', 'B']) {
    if (face !== side) await page.getByRole('button', { name: `终点 ${face}`, exact: true }).click();
  }
  const remaining = await page.evaluate(() => window.__appShell.$refs.activeView.netArrows.map(item => item.to));
  if (remaining.some(to => 'LFRB'.includes('URFDLB'[Math.floor(to / 9)])))
    throw Error('全部侧面关闭时仍绘制了侧面目的地箭头');
  if (remaining.length !== before.arrows.filter(item => 'URFDLB'[Math.floor(item.to / 9)] === 'U').length)
    throw Error('侧面过滤不应隐藏 U 面箭头');
  if (await page.locator('.op-net-overlay path.op-net-route').count() !== remaining.length)
    throw Error('屏幕箭头数量与筛选结果不符');
  await page.reload();
  if (await page.getByRole('button', { name: `终点 ${side}`, exact: true }).getAttribute('aria-pressed') !== 'false')
    throw Error('过滤选项刷新后未记住');
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2))
    throw Error('手机页面横向溢出');
}
