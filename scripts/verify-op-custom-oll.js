async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:18082/?mode=seamlessop&ui-check=custom-${Date.now()}`);
  await page.evaluate(() => { localStorage.removeItem('seamlessOpSettings'); localStorage.removeItem('cuberCustomOllLibrary'); });
  await page.reload();
  const formulas = await page.evaluate(() => window.__appShell.$refs.activeView.OLL.slice(0, 2).map(item => item.origin));
  await page.getByRole('button', { name: /选择 OLL/ }).click();
  const picker = page.getByRole('dialog', { name: '选择 OLL' });
  await picker.getByRole('button', { name: '自定义分组' }).click();
  for (const [index, label] of ['我的一号', '我的二号'].entries()) {
    await picker.getByLabel('自定义名称').fill(label);
    await picker.getByLabel('自定义公式').fill(formulas[index]);
    await picker.getByRole('button', { name: '保存自定义 OLL' }).click();
    if (await picker.locator('.op-custom-choices [data-op-choice]').count() !== index + 1)
      throw Error('自定义公式未加入分组');
  }
  const shared = await page.evaluate(() => JSON.parse(localStorage.getItem('cuberCustomOllLibrary')));
  if (shared.version !== 1 || shared.items.length !== 2 || shared.items[0].name !== '我的一号')
    throw Error('保存自定义 OLL 未写入共享库');
  if (JSON.parse(await page.evaluate(() => localStorage.getItem('seamlessOpSettings'))).customOlls)
    throw Error('旧训练设置仍在单独保存自定义列表');
  await picker.getByRole('button', { name: '全选', exact: true }).click();
  if (await picker.locator('.op-custom-choices [data-op-choice].active').count() !== 2)
    throw Error('自定义组全选未勾选所有条目');
  await picker.getByRole('button', { name: '取消选择', exact: true }).click();
  if (await picker.locator('.op-custom-choices [data-op-choice].active').count() !== 0)
    throw Error('自定义组取消选择未取消所有条目');
  const first = picker.locator('.op-custom-choices [data-op-choice]').first();
  const id = await first.getAttribute('data-op-choice');
  await first.click();
  await picker.getByRole('button', { name: '完成' }).click();
  await page.getByRole('button', { name: '新题', exact: true }).click();
  const current = await page.evaluate(() => window.__appShell.$refs.activeView.current);
  if (current.ollName !== '自定义 · 我的一号') throw Error('勾选的自定义公式没有参与出题');
  await page.reload();
  const saved = await page.evaluate(() => window.__appShell.$refs.activeView.settings);
  if (saved.customOlls.length !== 2 || saved.ollNames[0] !== id)
    throw Error('刷新后未恢复自定义组及勾选状态');
  await page.getByRole('button', { name: /选择 OLL/ }).click();
  await picker.getByRole('button', { name: '内置分组' }).click();
  await picker.locator('[data-op-choice="OLL-02"]').click();
  const pool = await page.evaluate(() => window.__appShell.$refs.activeView.availableOlls.map(item => item.name));
  if (JSON.stringify(pool) !== JSON.stringify(['OLL-02', '自定义 · 我的一号']))
    throw Error(`内置与自定义未能混选：${JSON.stringify(pool)}`);
  await picker.getByRole('button', { name: '全选', exact: true }).click();
  await picker.getByRole('button', { name: '取消选择', exact: true }).click();
  if (JSON.stringify(await page.evaluate(() => window.__appShell.$refs.activeView.settings.ollNames)) !== JSON.stringify([id]))
    throw Error('内置组批选影响了自定义组');
  await picker.getByRole('button', { name: '自定义分组' }).click();
  await picker.getByRole('button', { name: '编辑 我的一号' }).click();
  await picker.getByLabel('自定义名称').fill('重命名一号');
  await picker.getByRole('button', { name: '保存自定义 OLL' }).click();
  const renamed = await page.evaluate(() => window.__appShell.$refs.activeView.settings);
  if (renamed.customOlls[0].id !== id || renamed.customOlls[0].name !== '重命名一号' ||
      renamed.ollNames.indexOf(id) < 0) throw Error('编辑不应破坏稳定 ID 或选择');
  await picker.getByLabel('自定义名称').fill('坏公式');
  await picker.getByLabel('自定义公式').fill('R');
  await picker.getByRole('button', { name: '保存自定义 OLL' }).click();
  if (!await picker.locator('.op-custom-error').textContent()) throw Error('无效 OLL 应给出错误提示');
  if (await picker.locator('.op-custom-choices [data-op-choice]').count() !== 2)
    throw Error('无效 OLL 不应进入公式组');
  await picker.getByRole('button', { name: '删除 重命名一号' }).click();
  const removed = await page.evaluate(() => window.__appShell.$refs.activeView.settings);
  if (removed.ollNames.indexOf(id) >= 0 || removed.customOlls.length !== 1)
    throw Error('删除后公式或其选择仍残留');
  if (await page.evaluate(() => JSON.parse(localStorage.getItem('cuberCustomOllLibrary')).items.length) !== 1)
    throw Error('删除后共享库没有同步');
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2))
    throw Error('自定义分组导致手机横向溢出');
  await picker.getByRole('button', { name: '完成' }).click();
  await page.evaluate(formula => {
    localStorage.removeItem('cuberCustomOllLibrary');
    localStorage.setItem('seamlessOpSettings', JSON.stringify({ customOll: formula, useCustom: true }));
  }, formulas[0]);
  await page.reload();
  const migrated = await page.evaluate(() => window.__appShell.$refs.activeView.settings);
  if (migrated.customOlls.length !== 1 || migrated.ollNames[0] !== 'custom-legacy' ||
      await page.locator('.op-net-panel').count() !== 2)
    throw Error('旧单条自定义 OLL 没有迁移并显示题面');
  await page.evaluate(() => { localStorage.removeItem('seamlessOpSettings'); localStorage.removeItem('cuberCustomOllLibrary'); });
}
