async page => {
  const results = [];
  const base = page.url().split('?')[0];
  await page.evaluate(() => window.localStorage.removeItem('palette'));
  for (const mode of ['formulatimer', 'pll6', 'seamlessop']) {
    await page.goto(`${base}?mode=${mode}`);
    const checkbox = page.getByRole('checkbox', {name:/出题前 z2/});
    await checkbox.waitFor();
    for (const enabled of [false, true, false]) {
      await checkbox.setChecked(enabled);
      await page.waitForFunction(top => {
        const vm = window.__appShell.currentView();
        const facelets = vm.world.cube.serialize();
        return vm.palette.getColor(facelets[4]) === top && vm.palette.getColor(facelets[22]) === '#00A020';
      }, enabled ? '#FFD600' : '#F0F0F0');
      results.push({mode, z2:enabled, top:enabled ? '黄' : '白', front:'绿'});
    }
    if (mode === 'formulatimer') {
      await page.locator('[data-formula-preload]').check();
      await checkbox.check();
      await page.waitForFunction(() => {
        const vm = window.__appShell.currentView();
        return vm.nextCube && vm.palette.getColor(vm.nextCube.world.cube.serialize()[4]) === '#FFD600';
      });
    }
  }
  await page.goto(`${base}?mode=formulatimer`);
  await page.waitForFunction(() => {
    const vm = window.__appShell.currentView();
    return vm.settings.beforeZ2 && vm.palette.getColor(vm.world.cube.serialize()[4]) === '#FFD600';
  });
  return {results, preview:'yellow top', reload:'orientation retained'};
}
