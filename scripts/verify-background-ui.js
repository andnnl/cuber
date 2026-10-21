async page => {
  const base = page.url().split('?')[0];
  await page.goto(base + '?mode=playground');
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('cubeBackground.') || key === 'bleBackgroundColor') localStorage.removeItem(key);
    }
  });
  await page.reload();
  const color = () => page.locator('[data-cube-background]').first().evaluate(el => getComputedStyle(el).backgroundColor);
  await page.locator('.v-btn').first().click();
  const expectedPresets = [
    ['白色', '#FFFFFF'], ['浅灰', '#F3F4F6'], ['米白', '#FFF8E7'], ['淡黄', '#FFFDE7'],
    ['淡绿', '#E8F5E9'], ['淡青', '#465255'], ['淡蓝', '#48515E'], ['淡紫', '#514B5B'],
    ['淡粉', '#5D4C53'], ['暗黑', '#121212'],
  ];
  const presets = page.locator('[data-global-bg-preset]');
  const actualPresets = await presets.evaluateAll(els => els.map(el => [el.getAttribute('data-name'), el.getAttribute('data-color')]));
  if (JSON.stringify(actualPresets) !== JSON.stringify(expectedPresets)) throw Error('全局十色预设与 BLE Cross 不一致');
  await presets.nth(6).click();
  if (await color() !== 'rgb(72, 81, 94)') throw Error('全局预设没有更新主画布');
  if ((await page.locator('[data-global-bg]').inputValue()).toUpperCase() !== '#48515E') throw Error('全局调色器未同步预设');
  if (!(await presets.nth(6).getAttribute('class')).includes('selected')) throw Error('全局预设未标记选中');
  await page.reload();
  await page.locator('.v-btn').first().click();
  if (!(await presets.nth(6).getAttribute('class')).includes('selected') || await color() !== 'rgb(72, 81, 94)')
    throw Error('刷新后全局预设选择丢失');
  await page.locator('[data-global-bg]').fill('#123456');
  if (await color() !== 'rgb(18, 52, 86)') throw Error('全局色没有更新主画布');
  await page.locator('[data-page-bg-mode]').selectOption('custom');
  await page.locator('[data-page-bg]').fill('#654321');
  if (await color() !== 'rgb(101, 67, 33)') throw Error('当前界面覆盖色不生效');
  await presets.nth(9).click();
  if (await color() !== 'rgb(101, 67, 33)') throw Error('全局预设覆盖了当前界面自定义色');
  await page.locator('[data-global-bg]').fill('#123456');
  await page.evaluate(() => window.__appShell.navigate({mode:'cfop'}));
  await page.waitForSelector('.cfop-cube');
  if (await color() !== 'rgb(18, 52, 86)') throw Error('CFOP 跟随全局失败');
  if (await page.locator('.cfop-panel').evaluate(el => getComputedStyle(el).backgroundColor) !== 'rgb(255, 255, 255)')
    throw Error('CFOP 面板被全局背景色污染');
  const otherTab = await page.context().newPage();
  await otherTab.goto(base + '?mode=cfop');
  await otherTab.evaluate(() => localStorage.setItem('cubeBackground.global', '#234567'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-cube-background]')).backgroundColor === 'rgb(35, 69, 103)');
  await otherTab.close();
  await page.locator('.v-btn').first().click();
  await page.locator('[data-page-bg-mode]').selectOption('custom');
  await page.locator('[data-page-bg]').fill('#ABC123');
  if (await color() !== 'rgb(171, 193, 35)') throw Error('CFOP 自定义色未生效');
  await page.evaluate(() => window.__appShell.navigate({mode:'crossf2l'}));
  await page.waitForSelector('[data-cube-background]');
  if (await color() !== 'rgb(35, 69, 103)') throw Error('CrossF2L 没有跟随全局色');
  await page.evaluate(() => window.__appShell.navigate({mode:'cfop'}));
  if (await color() !== 'rgb(171, 193, 35)') throw Error('CFOP 覆盖色被其他界面冲掉');
  await page.evaluate(() => window.__appShell.navigate({mode:'playground'}));
  if (await color() !== 'rgb(101, 67, 33)') throw Error('切页后覆盖色丢失');
  await page.reload();
  if (await color() !== 'rgb(101, 67, 33)') throw Error('刷新后覆盖色丢失');
  await page.locator('.v-btn').first().click();
  await page.locator('[data-global-bg-reset]').click();
  if (await page.locator('[data-global-bg-preset].selected').count()) throw Error('恢复默认后预设仍选中');
  await page.locator('[data-page-bg-mode]').selectOption('global');
  if (await color() !== 'rgb(255, 255, 255)') throw Error('恢复默认失败');
  return {background:'ok'};
}
