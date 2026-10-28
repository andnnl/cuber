async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:18082/?mode=seamlessop&ui-check=oll-picker-${Date.now()}`);
  await page.evaluate(() => { localStorage.removeItem('seamlessOpSettings'); localStorage.removeItem('cuberCustomOllLibrary'); });
  await page.reload();
  await page.getByRole('button', { name: /选择 OLL/ }).click();
  const picker = page.getByRole('dialog', { name: '选择 OLL' });
  await picker.waitFor();
  if (await picker.locator('[data-op-choice]').count() !== 57) throw Error('OLL 公式数量不正确');
  if (await picker.locator('.op-oll-preview').count() !== 57) throw Error('OLL 卡片缺少平面图');
  await picker.getByRole('button', { name: '全选', exact: true }).click();
  if (await picker.locator('.op-oll-choices > .active').count() !== 57)
    throw Error('内置 OLL 全选未选中全部 57 条');
  await picker.getByRole('button', { name: '取消选择', exact: true }).click();
  const cleared = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { selected: view.settings.ollNames, pool: view.availableOlls.length };
  });
  if (cleared.selected.length || cleared.pool !== 57 || !await picker.getByText('未指定公式，默认使用全部内置').count())
    throw Error('取消全部选择后应提示并恢复默认内置池');
  if (await picker.locator('[data-op-choice="OLL-01"] .op-oll-preview-cell').count() !== 21)
    throw Error('OLL 平面图未显示顶面和四侧面顶层');
  const preview = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    const card = document.querySelector('[data-op-choice="OLL-01"]');
    const top = card.querySelector('[data-index="4"]');
    const facelets = view.ollPreviews['OLL-01'];
    const green = [...card.querySelectorAll('.op-oll-preview-cell')]
      .find(cell => facelets[Number(cell.dataset.index)] === 'F');
    return { top: facelets[4], front: facelets[22], topColor: top.style.backgroundColor,
      greenColor: green?.style.backgroundColor, hasFormula: card.textContent.includes(view.OLL[0].origin),
      allFixed: view.OLL.every(oll => view.ollPreviews[oll.name][4] === 'D' && view.ollPreviews[oll.name][22] === 'F') };
  });
  if (preview.top !== 'D' || preview.front !== 'F' ||
      preview.topColor !== 'rgb(255, 214, 0)' || preview.greenColor !== 'rgb(0, 160, 32)' ||
      !preview.hasFormula || !preview.allFixed)
    throw Error(`OLL 预览不是固定黄顶绿前逆公式图，或公式不可见：${JSON.stringify(preview)}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2))
    throw Error('OLL 弹窗手机布局横向溢出');
  await picker.locator('[data-op-choice="OLL-01"]').click();
  if (!await picker.locator('[data-op-choice="OLL-01"]').evaluate(el => el.classList.contains('active')))
    throw Error('OLL 卡片点击未选中');
  const second = await picker.locator('[data-op-choice="OLL-02"]').boundingBox();
  const third = await picker.locator('[data-op-choice="OLL-03"]').boundingBox();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2, { steps: 8 });
  await page.mouse.up();
  for (const name of ['OLL-02', 'OLL-03']) {
    if (!await picker.locator(`[data-op-choice="${name}"]`).evaluate(el => el.classList.contains('active')))
      throw Error(`${name} 鼠标拖动多选失效`);
  }
  await picker.getByRole('button', { name: '完成' }).click();
  await page.getByRole('button', { name: /选择 PLL/ }).click();
  if (await page.getByRole('dialog', { name: '选择 PLL' }).locator('.op-oll-preview').count())
    throw Error('PLL 选择列表不应显示 OLL 图');
}
