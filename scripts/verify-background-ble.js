async page => {
  await page.goto(page.url().split('?')[0] + '?mode=blecross');
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('cubeBackground.')) localStorage.removeItem(key);
    }
    localStorage.setItem('bleBackgroundColor', '#112233');
  });
  await page.reload();
  await page.waitForSelector('[data-ble-background]');
  const read = selector => page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor);
  if (await read('[data-ble-background]') !== 'rgb(17, 34, 51)') throw Error('旧 BLE 背景迁移失败');
  if (await page.locator('[data-ble-bg-mode]').inputValue() !== 'custom') throw Error('旧色没有迁移为自定义模式');
  const original = await page.evaluate(() => window.__bleCross.world.cube.serialize());
  await page.locator('[data-ble-fixed-open]').click();
  await page.waitForSelector('[data-ble-fixed-bg-custom]');
  if (await read('.ble-fixed-canvas') !== 'rgb(17, 34, 51)') throw Error('固定公式未读取 BLE 原色');
  await page.locator('[data-ble-fixed-bg-custom]').fill('#445566');
  if (await read('[data-ble-background]') !== 'rgb(68, 85, 102)') throw Error('固定公式改色未同步主页面');
  if (await page.evaluate(() => window.__bleCross.gifBackColor()) !== 0x445566) throw Error('GIF 未取 BLE 自定义背景色');
  await page.locator('.ble-fixed-top button').click();
  if (await page.evaluate(() => window.__bleCross.world.cube.serialize()) !== original) throw Error('背景改色影响魔方状态');
  await page.evaluate(() => window.__appShell.background.setGlobal('#789ABC'));
  if (await read('[data-ble-background]') !== 'rgb(68, 85, 102)') throw Error('全局色覆盖了 BLE 自定义色');
  await page.locator('.ble-bg-trigger').click();
  const blePresets = await page.locator('[data-ble-bg-preset]').evaluateAll(els => els.map(el => el.getAttribute('title')));
  if (blePresets.length !== 10 || blePresets[6] !== '淡蓝 #48515E') throw Error('BLE Cross 十色预设被改动');
  await page.locator('[data-ble-bg-mode]').selectOption('global');
  if (await read('[data-ble-background]') !== 'rgb(120, 154, 188)') throw Error('BLE 跟随全局失败');
  if (await page.evaluate(() => window.__bleCross.gifBackColor()) !== 0x789abc) throw Error('GIF 未取全局背景色');
  await page.reload();
  if (await read('[data-ble-background]') !== 'rgb(120, 154, 188)') throw Error('旧键重迁移覆盖了跟随模式');
  return {legacy:'ok', shared:'ok', follow:'ok'};
}
