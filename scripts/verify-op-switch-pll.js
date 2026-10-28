async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:18082/?mode=seamlessop&ui-check=switch-pll-${Date.now()}`);
  await page.evaluate(() => {
    localStorage.removeItem('seamlessOpSettings');
    localStorage.removeItem('cuberCustomOllLibrary');
  });
  await page.reload();
  const buttons = page.locator('.op-panel > .op-row').first().locator('button');
  if (await buttons.nth(1).innerText() !== '重试同题' || await buttons.nth(2).innerText() !== '换 PLL 重试同题')
    throw Error('换 PLL 按钮未紧挨重试同题');
  const select = page.getByLabel('出题类型');
  await select.selectOption('none');
  await page.getByRole('checkbox', { name: '出题前 z2' }).check();
  const before = await page.evaluate(() => {
    const app = window.__appShell.$refs.activeView;
    return { ...app.current, step: app.step, startedAt: app.training.startedAt };
  });
  if (before.targetPll !== '无 PLL') throw Error('出题模式未切换到无 PLL');
  await page.getByRole('button', { name: '换 PLL 重试同题' }).click();
  const after = await page.evaluate(() => {
    const app = window.__appShell.$refs.activeView;
    return { ...app.current, step: app.step, startedAt: app.training.startedAt, readOnly: app.training.readOnly };
  });
  if (after.targetPll === '无 PLL' || after.ollFormula !== before.ollFormula || after.ollName !== before.ollName ||
      after.y !== before.y || after.z2 !== before.z2 || after.beforeFacelets === before.beforeFacelets ||
      after.step !== 0 || after.startedAt < before.startedAt || after.readOnly) throw Error('换 PLL 没有保留题目条件或重置计时');
  if (await select.inputValue() !== 'none') throw Error('换 PLL 改动了出题类型');
  await page.evaluate(() => {
    const app = window.__appShell.$refs.activeView;
    app.settings.pllNames = [`PLL-${app.current.targetPll}`];
  });
  await page.getByRole('button', { name: '换 PLL 重试同题' }).click();
  if (!/没有可更换的 PLL/.test(await page.getByRole('status').first().innerText()) ||
      await page.evaluate(() => window.__appShell.$refs.activeView.current.beforeFacelets) !== after.beforeFacelets)
    throw Error('没有其他 PLL 时未保留原题并提示');
  const checkbox = page.getByRole('checkbox', { name: '隐藏预测结果' });
  await checkbox.check();
  if (await page.getByLabel('OLL 后顶层与四侧面').count()) throw Error('预测图仍显示');
  if (!await page.getByText('OLL 后 · 预测结果').count()) throw Error('预测图标题丢失');
  await page.reload();
  if (!await checkbox.isChecked() || await page.getByLabel('OLL 后顶层与四侧面').count())
    throw Error('隐藏预测图设置未持久化');
  await checkbox.uncheck();
  await page.getByLabel('OLL 后顶层与四侧面').waitFor();
  await page.evaluate(() => { localStorage.removeItem('seamlessOpSettings'); localStorage.removeItem('cuberCustomOllLibrary'); });
}
