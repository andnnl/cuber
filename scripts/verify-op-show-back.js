async page => {
  const expect = (condition, message) => { if (!condition) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = page.url().split('/').slice(0, 3).join('/');
  await page.goto(`${origin}/?mode=seamlessop&show-back-check=${Date.now()}`);
  await page.waitForFunction(() => window.__appShell?.$refs.activeView?.current);
  await page.evaluate(() => {
    const vm = window.__appShell.$refs.activeView;
    vm.settings.showBack = false;
    vm.settings.allTrajectories = false;
    vm.settings.focusLevel = 'all';
    vm.toggleBack();
    for (const oll of vm.OLL) {
      vm.settings.ollNames = [oll.name];
      vm.nextCase();
      const missing = vm.coverage.find(window => window.missing > 0);
      if (missing) { vm.selectOpWindow(missing.view); break; }
    }
  });
  const checkbox = page.getByRole('checkbox', { name: '显示 B 面', exact: true });
  await page.getByLabel('显示线索', { exact: true }).check();
  const before = await page.evaluate(() => {
    const vm = window.__appShell.$refs.activeView;
    return { scramble: vm.current.scramble, view: vm.focus.view, missing: vm.focus.missing, arrows: vm.netArrows.length };
  });
  expect(before.missing > 0, '测试题应包含背面来源');
  expect(await page.locator('.op-net-before .op-net-cell').count() === 18, '默认左图不显示 B 面');
  await checkbox.check();
  expect(await page.locator('.op-net-before .op-net-cell').count() === 21, '勾选应补齐三格');
  const shown = await page.evaluate(() => {
    const vm = window.__appShell.$refs.activeView;
    return { scramble: vm.current.scramble, view: vm.focus.view, missing: vm.focus.missing,
      arrows: vm.netArrows, cells: vm.beforeCells, saved: JSON.parse(localStorage.getItem('seamlessOpSettings')).showBack };
  });
  expect(shown.scramble === before.scramble && shown.view === before.view, '切换不应换题或切换观察窗口');
  expect(shown.missing === 0 && shown.saved, '应重算覆盖并保存开关');
  const back = shown.arrows.find(arrow => [45, 46, 47].includes(arrow.from));
  expect(!!back && shown.arrows.length > before.arrows, '当前六格应补上 B 面来源箭头');
  expect(await page.locator('.op-net-route').count() === shown.arrows.length, '箭头应实际绘制到 SVG');
  await page.locator(`.op-net-before [data-index="${back.from}"]`).click();
  expect(await page.locator('.op-net-route').count() === 1, 'B 面色块应支持单独聚焦箭头');
  await checkbox.uncheck();
  expect(await page.locator('.op-net-before .op-net-cell').count() === 18, '取消应恢复隐藏');
  expect(await page.evaluate(() => window.__appShell.$refs.activeView.netArrows.every(arrow => ![45,46,47].includes(arrow.from))), '取消后不得残留背面来源箭头');
  await checkbox.check();
  await page.getByLabel('查看全部轨迹', { exact: true }).check();
  await page.getByLabel('显示线索', { exact: true }).uncheck();
  expect(await page.locator('.op-net-route').count() === 0, '显示 B 面不应绕过线索开关');
  await page.getByLabel('显示线索', { exact: true }).check();
  await page.reload();
  await checkbox.waitFor();
  expect(await checkbox.isChecked(), '刷新应记住显示 B 面');
  for (const z2 of [false, true]) {
    await page.evaluate(z2 => {
      const vm = window.__appShell.$refs.activeView;
      vm.settings.z2 = z2;
      vm.changeZ2();
      vm.settings.destinationFaces = ['L', 'F', 'R', 'B'];
    }, z2);
    const correct = await page.evaluate(() => {
      const vm = window.__appShell.$refs.activeView;
      return vm.netArrows.every(arrow => vm.beforeCells.some(cell => cell.index === arrow.from) &&
        vm.trace.positions[vm.trace.positions.length - 1][arrow.id] === arrow.to &&
        vm.netBefore[arrow.from] !== vm.netBefore[4] && arrow.targetVisible);
    });
    expect(correct, 'z2 前后箭头应匹配真实色贴及终点');
  }
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const fits = await page.evaluate(() => {
      const panel = document.querySelector('.op-net-before').getBoundingClientRect();
      return Array.from(document.querySelectorAll('.op-net-before header label')).every(label => {
        const rect = label.getBoundingClientRect();
        return rect.left >= panel.left && rect.right <= panel.right;
      }) && document.documentElement.scrollWidth <= innerWidth;
    });
    expect(fits, `显示 B 面开关不应溢出 ${width}px 布局`);
  }
  expect(errors.length === 0, `页面异常：${errors.join('; ')}`);
  return { cells: shown.cells.length, extraArrows: shown.arrows.length - before.arrows, persistence: true, layouts: [390,768,1280], errors };
}
