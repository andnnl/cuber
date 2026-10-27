async page => {
  await page.goto('http://127.0.0.1:18082/?mode=seamlessop');
  await page.getByRole('heading', { name: '无缝 OP 训练' }).waitFor();
  if (await page.locator('.op-predicted .revealed').count()) throw Error('题前泄露六格答案');
  await page.getByRole('button', { name: '显示线索' }).click();
  if (!await page.locator('.op-arrows line').count()) throw Error('线索缺少贴纸轨迹');
  await page.getByRole('button', { name: 'L/F' }).click();
  await page.getByRole('button', { name: '演示验证' }).click();
  await page.getByRole('button', { name: '回到题面' }).click();
  await page.getByLabel('出题类型').selectOption('none');
  const caseInfo = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { name: view.current.targetPll, before: view.current.beforeFacelets,
      scene: view.world.cube.serialize(), after: view.current.afterFacelets };
  });
  if (caseInfo.name !== '无 PLL' || caseInfo.before !== caseInfo.scene) throw Error('无 PLL 题面不一致');
  await page.getByRole('button', { name: '无 PLL', exact: true }).click();
  if (await page.locator('.op-six .revealed').count() !== 6) throw Error('正确答题未揭示六格');
  const playbackMatches = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    view.setStep(view.current.moves.length);
    return view.world.cube.serialize() === view.current.afterFacelets;
  });
  if (!playbackMatches) throw Error('播放结束状态不匹配目标');
  await page.getByRole('button', { name: '重试同题' }).click();
  if (await page.locator('.op-six .revealed').count()) throw Error('重试未隐藏答案');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) throw Error('手机横向溢出');
}
