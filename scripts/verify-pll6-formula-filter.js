async page => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto(`http://127.0.0.1:18082/?mode=pll6&filter=${Date.now()}`);
  await page.evaluate(() => localStorage.removeItem('pll6AllowedNames'));
  await page.reload();
  await page.getByRole('button', { name: '选择公式 · 全部' }).click();
  const dialog = page.getByRole('dialog', { name: '选择随机公式' });
  await dialog.waitFor();
  const chips = dialog.locator('.pll6-picker-chip');
  if (await chips.count() !== 21) throw new Error('弹层须列出 21 个 PLL');
  if (!await dialog.getByRole('button', { name: '保存选择' }).isVisible()) throw new Error('保存按钮未固定可见');
  const listMetrics = await dialog.locator('.pll6-picker-list').evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight }));
  if (listMetrics.height >= listMetrics.content) throw new Error(`窄屏列表未独立滚动 ${JSON.stringify(listMetrics)}`);
  await dialog.locator('.pll6-picker-list').evaluate(el => { el.scrollTop = 60; });
  if ((await dialog.locator('.pll6-picker-list').evaluate(el => el.scrollTop)) === 0) throw new Error('列表无法滚动');
  await dialog.locator('.pll6-picker-list').evaluate(el => { el.scrollTop = 0; });
  await dialog.getByRole('button', { name: 'Ab' }).click();
  await dialog.getByRole('button', { name: '取消' }).click();
  const currentBeforeEscape = await page.evaluate(() => window.__appShell.$refs.activeView.training.current);
  await page.getByRole('button', { name: '选择公式 · 全部' }).click();
  if (await dialog.getByRole('button', { name: 'Ab' }).getAttribute('aria-pressed') !== 'false') throw new Error('取消未丢弃草稿');
  await page.keyboard.press('Escape');
  const current = await page.evaluate(() => window.__appShell.$refs.activeView.training.current.scramble);
  if (current !== currentBeforeEscape.scramble || await dialog.isVisible()) throw new Error('Esc 应只关闭弹层，不能重置案例');
  await page.getByRole('button', { name: '选择公式 · 全部' }).click();
  await dialog.getByRole('button', { name: '全选', exact: true }).click();
  if (await dialog.locator('.pll6-picker-chip[aria-pressed="true"]').count() !== 21) throw new Error('全选应选择 21 项');
  await dialog.getByRole('button', { name: '清空（全部随机）' }).click();
  if (await dialog.locator('.pll6-picker-chip[aria-pressed="true"]').count() !== 0) throw new Error('清空应表示全部随机');
  const mousePaint = async names => {
    const centers = [];
    for (const name of names) {
      const box = await dialog.getByRole('button', { name, exact: true }).boundingBox();
      if (!box) throw new Error(`鼠标目标不可见：${name}`);
      centers.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    await page.mouse.move(centers[0].x, centers[0].y);
    await page.mouse.down();
    for (const center of centers.slice(1)) await page.mouse.move(center.x, center.y, { steps: 3 });
    await page.mouse.up();
  };
  await mousePaint(['Ab', 'E', 'F']);
  for (const name of ['Ab', 'E', 'F'])
    if (await dialog.getByRole('button', { name, exact: true }).getAttribute('aria-pressed') !== 'true')
      throw new Error(`鼠标拖动未选中 ${name}`);
  await mousePaint(['Ab', 'E', 'F']);
  for (const name of ['Ab', 'E', 'F'])
    if (await dialog.getByRole('button', { name, exact: true }).getAttribute('aria-pressed') !== 'false')
      throw new Error(`鼠标拖动未取消 ${name}`);
  await dialog.getByRole('button', { name: 'Aa', exact: true }).click();
  if (await dialog.getByRole('button', { name: 'Aa', exact: true }).getAttribute('aria-pressed') !== 'true')
    throw new Error('鼠标单击不再切换单项');
  await dialog.getByRole('button', { name: 'Aa', exact: true }).click();
  const gesture = async (names, hold, moveBeforeHold = false) => page.evaluate(async ({ names, hold, moveBeforeHold }) => {
    const elements = names.map(name => [...document.querySelectorAll('.pll6-picker-chip')].find(el => el.textContent.trim() === name));
    if (elements.some(el => !el)) throw new Error('手势目标不存在');
    const make = (type, el, x, y) => {
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [touch], changedTouches: [touch], targetTouches: type === 'touchend' ? [] : [touch] }));
    };
    const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const [x, y] = center(elements[0]);
    make('touchstart', elements[0], x, y);
    if (moveBeforeHold) make('touchmove', elements[0], x, y + 18);
    if (hold) {
      await new Promise(resolve => setTimeout(resolve, 420));
      if (!document.querySelector('.pll6-picker-header')?.textContent.includes('划选中')) throw new Error('长按没有可见划选反馈');
    }
    for (const el of elements.slice(1)) { const [nx, ny] = center(el); make('touchmove', el, nx, ny); }
    make('touchend', elements[elements.length - 1], x, y);
  }, { names, hold, moveBeforeHold });
  await gesture(['Ab', 'E'], false, true);
  if (await dialog.getByRole('button', { name: 'Ab' }).getAttribute('aria-pressed') !== 'false') throw new Error('普通滑动误选');
  await gesture(['Ab', 'E', 'F'], true);
  for (const name of ['Ab', 'E', 'F']) if (await dialog.getByRole('button', { name }).getAttribute('aria-pressed') !== 'true') throw new Error(`长按未选 ${name}: ${JSON.stringify(await page.evaluate(() => ({ draft: window.__appShell.$refs.activeView.draftNames, active: window.__appShell.$refs.activeView.touchPainting })))}`);
  await gesture(['Ab', 'E', 'F'], true);
  for (const name of ['Ab', 'E', 'F']) if (await dialog.getByRole('button', { name }).getAttribute('aria-pressed') !== 'false') throw new Error(`长按未取消 ${name}`);
  await page.waitForTimeout(220); // 长按释放后的合成 click 防重入窗口
  await dialog.getByRole('button', { name: 'F', exact: true }).click();
  const before = await page.evaluate(() => window.__appShell.$refs.activeView.training.current);
  await dialog.getByRole('button', { name: '保存选择' }).click();
  const after = await page.evaluate(() => window.__appShell.$refs.activeView.training.current);
  if (before.scramble !== after.scramble) throw new Error('保存筛选替换了当前题目');
  await page.getByRole('button', { name: '选择公式 · 1 条' }).click();
  await dialog.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '新案例' }).click();
  if ((await page.evaluate(() => window.__appShell.$refs.activeView.training.current.name)) !== 'PLL-F') throw new Error('新题不在筛选池');
  if (await page.locator('.pll6-answers button').count() !== 21) throw new Error('答案按钮不能因筛选减少');
  await page.reload();
  await page.getByRole('button', { name: '选择公式 · 1 条' }).click();
  if (await page.evaluate(() => window.__appShell.$refs.activeView.training.current.name) !== 'PLL-F')
    throw new Error('刷新后初始案例没有遵守已保存筛选');
  await dialog.getByRole('button', { name: '清空（全部随机）' }).click();
  await dialog.getByRole('button', { name: '保存选择' }).click();
  await page.getByRole('button', { name: '选择公式 · 全部' }).waitFor();
  await page.getByRole('button', { name: '选择公式 · 全部' }).click();
  const cdp = await page.context().newCDPSession(page);
  const ab = await dialog.getByRole('button', { name: 'Ab' }).boundingBox();
  const e = await dialog.getByRole('button', { name: 'E', exact: true }).boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ab.x + ab.width / 2, y: ab.y + ab.height / 2, id: 1 }] });
  await page.waitForTimeout(420);
  if (!await dialog.locator('.pll6-picker-header').getByText('划选中', { exact: false }).isVisible()) throw new Error('真实触摸长按未进入划选');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: e.x + e.width / 2, y: e.y + e.height / 2, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  if (await dialog.getByRole('button', { name: 'Ab' }).getAttribute('aria-pressed') !== 'true' ||
    await dialog.getByRole('button', { name: 'E', exact: true }).getAttribute('aria-pressed') !== 'true')
    throw new Error('真实触摸划选未跨格生效');
  await dialog.getByRole('button', { name: '取消' }).click();
  await page.evaluate(() => localStorage.setItem('pll6AllowedNames', '{invalid-json'));
  await page.reload();
  await page.getByRole('button', { name: '选择公式 · 全部' }).waitFor();
  console.log('PLL 公式筛选、鼠标拖选、触摸长按划选、持久化与下一题生效通过');
}
