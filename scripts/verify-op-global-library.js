async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:18082/?mode=algs&ui-check=global-oll-${Date.now()}`);
  await page.evaluate(() => {
    localStorage.setItem('seamlessOpSettings', JSON.stringify({ customOlls: [
      { id: 'custom-global-one', name: '我的测试 OLL', origin: "F R U R' U' F'" },
    ], ollNames: ['custom-global-one'] }));
    localStorage.removeItem('cuberCustomOllLibrary');
    localStorage.removeItem('algs');
  });
  await page.reload();
  await page.getByRole('button', { name: /F2L-/ }).first().click();
  const tab = page.getByRole('tab', { name: '自定义 OLL' });
  await tab.click();
  const list = page.getByRole('tab', { name: '自定义 OLL' });
  if (!await list.count()) throw Error('公式库没有自定义 OLL 分组');
  if (await page.getByRole('button', { name: '删除', exact: true }).count())
    throw Error('公式库的自定义 OLL 分组不应提供删除按钮');
  await page.getByRole('button', { name: '我的测试 OLL', exact: true }).click();
  if (!await page.getByText("F R U R' U' F'", { exact: true }).count())
    throw Error('自定义 OLL 公式未显示');
  if (!await page.locator('input[readonly]').count()) throw Error('公式库自定义 OLL 不应允许修改');
  await page.getByText('play_arrow', { exact: true }).click();
  const started = await page.evaluate(() => window.__appShell.$refs.activeView.playbar.progress > 0);
  if (!started) throw Error('自定义 OLL 未开始播放');
  await page.goto(`http://127.0.0.1:18082/?mode=seamlessop&ui-check=global-oll-return-${Date.now()}`);
  await page.getByRole('button', { name: /选择 OLL/ }).click();
  await page.getByRole('dialog', { name: '选择 OLL' }).getByRole('button', { name: '自定义分组' }).click();
  if (!await page.getByText('我的测试 OLL', { exact: true }).count())
    throw Error('共享库中的 OLL 未回到训练界面');
  await page.getByLabel('自定义名称').fill('第二条 OLL');
  await page.getByLabel('自定义公式').fill("F R U R' U' F'");
  await page.getByRole('button', { name: '保存自定义 OLL' }).click();
  await page.goto(`http://127.0.0.1:18082/?mode=algs&ui-check=global-oll-update-${Date.now()}`);
  await page.getByRole('button', { name: '我的测试 OLL' }).click();
  await page.getByRole('tab', { name: '自定义 OLL' }).click();
  if (!await page.getByRole('button', { name: '第二条 OLL', exact: true }).count())
    throw Error('从训练界面新保存的 OLL 没有同步到公式库');
  await page.evaluate(() => {
    const link = document.createElement('a'); link.href = '?mode=seamlessop';
    document.body.appendChild(link); link.click(); link.remove();
  });
  await page.getByRole('heading', { name: '无缝 OP 训练' }).waitFor();
  await page.evaluate(() => {
    const link = document.createElement('a'); link.href = '?mode=algs';
    document.body.appendChild(link); link.click(); link.remove();
  });
  await page.getByRole('button', { name: '我的测试 OLL' }).waitFor();
  await page.getByRole('button', { name: '我的测试 OLL' }).click();
  await page.getByRole('tab', { name: '自定义 OLL' }).click();
  if (!await page.getByRole('button', { name: '第二条 OLL', exact: true }).count())
    throw Error('站内切换后自定义公式分组未同步');
  await page.evaluate(() => { localStorage.removeItem('seamlessOpSettings'); localStorage.removeItem('cuberCustomOllLibrary'); });
}
