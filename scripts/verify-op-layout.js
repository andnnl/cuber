async page => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:18082/?mode=seamlessop&ui-check=layout');
  await page.getByRole('heading', { name: '无缝 OP 训练' }).waitFor();

  const measure = () => page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const cube = rect('.op-cube');
    const before = rect('.op-net-before');
    const after = rect('.op-net-after');
    const panel = rect('.op-panel');
    const canvas = rect('.op-cube canvas');
    const net = rect('.op-net-before .op-net');
    const menu = rect('.v-btn--fab');
    return {
      cube: { top: cube.top, left: cube.left, right: cube.right, width: cube.width },
      before: { top: before.top, left: before.left, right: before.right },
      after: { top: after.top, left: after.left, right: after.right },
      beforeWidth: before.width,
      netWidth: net.width,
      menuBottom: menu.bottom,
      panelTop: panel.top + scrollY,
      canvasWidth: canvas.width,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.querySelector('.op-root').scrollHeight,
      clientHeight: document.querySelector('.op-root').clientHeight
    };
  });

  const desktop = await measure();
  if (desktop.before.top <= desktop.cube.top ||
      Math.abs(desktop.before.top - desktop.after.top) > 4 ||
      desktop.cube.right > desktop.before.left + 2 ||
      desktop.before.right > desktop.after.left + 2)
    throw Error(`桌面未按魔方、当前 OLL、预测 OLL 三列排列：${JSON.stringify(desktop)}`);
  if (desktop.beforeWidth > 270 || desktop.beforeWidth - desktop.netWidth > 65)
    throw Error(`OLL 图卡片两侧空白过多：${JSON.stringify(desktop)}`);
  if (desktop.before.top < desktop.menuBottom + 16)
    throw Error(`OLL 图与悬浮菜单间距不足：${JSON.stringify(desktop)}`);
  if (desktop.canvasWidth > desktop.cube.width + 2) throw Error('魔方画布超出自身列宽');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await measure();
  if (mobile.before.top < mobile.cube.top + 150 ||
      Math.abs(mobile.before.top - mobile.after.top) > 4 ||
      mobile.before.right > mobile.after.left + 2)
    throw Error(`手机双图未在魔方下方并排：${JSON.stringify(mobile)}`);
  if (mobile.scrollWidth > 392) throw Error('手机页面出现横向溢出');
  if (mobile.scrollHeight <= mobile.clientHeight) throw Error('下方内容无法纵向滚动');
  await page.locator('.op-records').scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => {
    const root = document.querySelector('.op-root');
    const record = document.querySelector('.op-records').getBoundingClientRect();
    return root.scrollTop > 0 && record.top >= 0 && record.top < innerHeight;
  });
  if (!scrolled) throw Error('滚动后仍看不到训练记录');
}
