async page => {
  const origin = page.url().startsWith('http') ? page.url().split('/').slice(0, 3).join('/') : 'http://127.0.0.1:18084';
  for (const width of [360, 1024]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto(`${origin}/?mode=pll6`);
    await page.waitForSelector('.pll6-cube canvas');
    await page.locator('.v-btn').filter({ has: page.locator('.v-icon') }).first().click();
    const grid = page.locator('[data-main-mode-grid]');
    await grid.waitFor();
    const layout = await grid.evaluate(el => {
      const buttons = [...el.querySelectorAll('button')];
      const rect = el.getBoundingClientRect();
      const positions = buttons.map(button => button.getBoundingClientRect());
      return { count: buttons.length, rows: new Set(positions.map(pos => Math.round(pos.top))).size,
        overflow: positions.some(pos => pos.left < rect.left - 1 || pos.right > rect.right + 1),
        columnCount: getComputedStyle(el).gridTemplateColumns.split(' ').length };
    });
    if (layout.count !== 9 || layout.rows !== 3 || layout.columnCount !== 3 || layout.overflow)
      throw new Error(`${width}px 主菜单布局错误：${JSON.stringify(layout)}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      throw new Error(`${width}px 页面水平溢出`);
    await grid.getByRole('button', { name: /PLL六格/ }).click();
    if (!page.url().includes('mode=pll6')) throw new Error('PLL 六格入口未跳转');
  }
  console.log('主菜单三列多行及桌面/手机布局通过');
}
