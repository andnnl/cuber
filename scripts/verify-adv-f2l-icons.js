async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${page.url().split('?')[0]}?mode=advf2l`);
  await page.getByRole('checkbox', { name: 'z2', exact: true }).uncheck();
  const ready = () => page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.adv-f2l-preview-image')];
    return images.length === 18 && images.every(image => image.complete && image.naturalWidth === 256);
  });
  await ready();
  const first = await page.locator('.adv-f2l-preview-image').first().getAttribute('src');
  for (let group = 0; group < 3; group++) {
    await page.locator('.adv-f2l-groups button').nth(group).click();
    for (let direction = 0; direction < 4; direction++) {
      await page.locator('.adv-f2l-directions button').nth(direction).click();
      for (const flipped of [false, true]) {
        await page.getByRole('checkbox', { name: 'z2', exact: true }).setChecked(flipped);
        await page.waitForFunction(() => {
          const view = window.__appShell.currentView();
          return view.filteredCases.every(item => view.previews[view.previewKey(item)]);
        });
        await ready();
        const rendered = await page.evaluate(() => {
          const view = window.__appShell.currentView();
          const capture = view.capture;
          const cube = capture.scene.children.find(child => child.initials);
          const visibility = cube.initials.flatMap(piece => piece.stickers.filter(Boolean))
            .map(sticker => [sticker, sticker.visible]);
          visibility.forEach(([sticker]) => { sticker.visible = true; });
          const state = cube.serialize();
          visibility.forEach(([sticker, visible]) => { sticker.visible = visible; });
          const slots = [
            [[29, 26, 15], [23, 12]], [[27, 44, 24], [21, 41]],
            [[33, 53, 42], [50, 39]], [[35, 17, 51], [48, 14]],
          ];
          const protectedErrors = [], blackErrors = [];
          const cornerPosition = [20, 18, 0, 2][view.direction] + (view.group === 'Trapped Edge' ? 6 : 0);
          const targetCorner = cube.cubelets[cornerPosition];
          const targetEdgeColors = targetCorner.stickers.filter(Boolean).map(sticker => sticker.name)
            .filter(color => color !== state[31]).sort().join('');
          slots.forEach((pieces, direction) => {
            const done = pieces.flat().every(position => state[position] === state[Math.floor(position / 9) * 9 + 4]);
            for (const positions of pieces) {
              const colors = positions.map(position => state[Math.floor(position / 9) * 9 + 4]).sort().join('');
              const piece = cube.initials.find(piece => piece.stickers.filter(Boolean)
                .map(sticker => sticker.name).sort().join('') === colors);
              const stickers = piece.stickers.filter(Boolean);
              if (piece.initial === targetCorner.initial || colors === targetEdgeColors || done) {
                if (!stickers.every(sticker => sticker.visible)) protectedErrors.push({ direction, done, colors });
              } else if (!stickers.every(sticker => !sticker.visible)) blackErrors.push({ direction, colors });
            }
          });
          return { complete: cube.initials.every(piece => piece.visible), protectedErrors, blackErrors };
        });
        assert(rendered.complete, '无关槽位必须保留黑色块体，不能挖空');
        assert(rendered.protectedErrors.length === 0, `目标角棱及初始已完成槽位不能变黑：${JSON.stringify(rendered.protectedErrors)}`);
        assert(rendered.blackErrors.length === 0, `只有无关且未完成的槽位应变黑：${JSON.stringify(rendered.blackErrors)}`);
      }
    }
  }
  await page.locator('.adv-f2l-groups button').first().click();
  await page.locator('.adv-f2l-directions button').first().click();
  await page.getByRole('checkbox', { name: 'z2', exact: true }).uncheck();
  await ready();
  const restored = await page.locator('.adv-f2l-preview-image').first().getAttribute('src');
  assert(first === restored, '切换后题面没有恢复');
  const visible = await page.evaluate(() => {
    const capture = window.__appShell.currentView().capture;
    capture.snap({}, '', 3);
    return capture.scene.children.find(child => child.initials).initials.every(piece => piece.visible &&
      Object.values(piece.stickers).every(sticker => sticker.visible));
  });
  assert(visible, '共用 Capture 后普通公式库不能遗留黑色贴纸');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.locator('.adv-f2l-cases').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length === 3), '手机布局应保持三列');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '手机页面横向溢出');
  await page.locator('.adv-f2l-browser').screenshot({ path: '/tmp/cuber-adv-icons-mobile.png' });
  assert(errors.length === 0, errors.join('\n'));
  console.log('非标 F2L 图标：三分类、四方向、z2、无关槽位变黑和手机布局通过');
}
