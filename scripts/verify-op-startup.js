async page => {
  await page.goto(`http://127.0.0.1:18082/?mode=seamlessop&ui-check=startup-${Date.now()}`);
  for (const formula of ['', 'not-a-move']) {
    await page.evaluate(customOll => {
      localStorage.removeItem('cuberCustomOllLibrary');
      localStorage.setItem('seamlessOpSettings', JSON.stringify({ useCustom: true, customOll }));
    }, formula);
    await page.reload();
    await page.getByRole('heading', { name: '无缝 OP 训练' }).waitFor();
    if (await page.locator('.op-net-panel').count() !== 2)
      throw Error(`旧自定义公式 ${JSON.stringify(formula)} 使两张 OLL 卡片消失`);
    const restored = await page.evaluate(() => window.__appShell.$refs.activeView.settings);
    if (restored.customOlls.length || restored.ollNames.length)
      throw Error('无效的旧自定义公式不应进入新分组或被选中');
    if (formula) {
      await page.getByRole('button', { name: /选择 OLL/ }).click();
      await page.getByRole('dialog', { name: '选择 OLL' }).getByRole('button', { name: '自定义分组' }).click();
      if (await page.getByLabel('自定义公式').inputValue() !== formula ||
          !await page.locator('.op-custom-error').textContent())
        throw Error('旧无效公式应保留在编辑区供用户修正');
      await page.getByRole('button', { name: '完成' }).click();
    }
  }
  await page.evaluate(() => {
    localStorage.removeItem('cuberCustomOllLibrary');
    const customOll = window.__appShell.$refs.activeView.OLL[0].origin;
    localStorage.setItem('seamlessOpSettings', JSON.stringify({ useCustom: true, customOll }));
  });
  await page.reload();
  const migrated = await page.evaluate(() => window.__appShell.$refs.activeView.settings);
  if (await page.locator('.op-net-panel').count() !== 2 ||
      migrated.customOlls.length !== 1 || migrated.ollNames[0] !== 'custom-legacy')
    throw Error('有效自定义 OLL 应继续正常出题并显示两张卡片');
  await page.evaluate(() => { localStorage.removeItem('seamlessOpSettings'); localStorage.removeItem('cuberCustomOllLibrary'); });
}
