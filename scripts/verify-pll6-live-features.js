async page => {
  const assert = (condition,message) => { if (!condition) throw Error(message); };
  await page.goto('http://127.0.0.1:18098/?mode=pll6');
  await page.locator('.pll6-root').waitFor();
  await page.getByRole('checkbox',{name:'显示当前特征'}).check();
  const mode = page.getByRole('combobox',{name:'观察方式'});
  const options = await mode.locator('option').evaluateAll(elements => elements.map(element => element.value));
  assert(JSON.stringify(options) === JSON.stringify(['equality','legacy']),`未移除逐对比较：${options}`);
  const prepare = async name => page.evaluate(name => {
    const vm = window.__appShell.currentView();
    const choice = vm.choices.find(item => item.name === `PLL-${name}`);
    vm.useZ2 = false;
    vm.training.setZ2(false);
    vm.world.cube.twister.setup(vm.training.invert(choice.origin));
    return vm.world.cube.serialize();
  },name);
  const waitLive = async name => page.waitForFunction(name => {
    const vm = window.__appShell.currentView();
    const state = vm.world.cube.serialize();
    return [...vm.world.cube.locks.values()].every(lock => !lock.size) && vm.actualFeature?.name === name &&
      vm.actualFeature.six === [18,19,20,9,10,11].map(index => state[index]).join('');
  },name);
  for (const observationMode of ['equality','legacy']) {
    await mode.selectOption(observationMode);
    await prepare('Aa');
    await waitLive('Aa');
    const before = await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      return {six:vm.actualFeature.six,question:vm.training.current.scramble,records:vm.records.length};
    });
    await page.evaluate(() => window.__appShell.currentView().world.cube.twister.push('U'));
    await waitLive('Aa');
    assert(await page.evaluate(six => window.__appShell.currentView().actualFeature.six !== six,before.six),'U 转动后未重算');
    await prepare('Ja');
    await waitLive('Ja');
    await page.evaluate(() => window.__appShell.currentView().world.cube.twister.push('R'));
    await page.waitForFunction(() => {
      const vm = window.__appShell.currentView();
      return vm.actualFeature === null && vm.visualClues.length === 0 && vm.stickerPoints.length === 0;
    });
    await page.waitForFunction(() => [...window.__appShell.currentView().world.cube.locks.values()].every(lock => !lock.size));
    assert(await page.locator('.pll6-visual-overlay').count() === 0,'非 PLL 状态残留线索');
    await page.evaluate(() => window.__appShell.currentView().world.cube.twister.push("R'"));
    await waitLive('Ja');
    assert(await page.evaluate(before => {
      const vm = window.__appShell.currentView();
      return vm.training.current.scramble === before.question && vm.records.length === before.records;
    },before),'重算修改了题目或训练记录');
  }
  await mode.selectOption('equality');
  await page.getByRole('checkbox',{name:'显示当前特征'}).uncheck();
  await prepare('Ab');
  await waitLive('Ab');
  assert(await page.locator('.pll6-visual-overlay').count() === 0,'隐藏特征后仍显示覆层');
  await page.getByRole('checkbox',{name:'显示当前特征'}).check();
  assert(await page.evaluate(() => window.__appShell.currentView().equalityPlan?.name === 'Ab'),'重新显示时未使用最新状态');
  await prepare('Aa');
  await waitLive('Aa');
  const physicalBefore = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    vm.snapshot = {status:'connected'};
    const six = vm.actualFeature.six;
    vm.handlePhysicalEvent({type:'move',move:'U',serial:900001},true);
    return six;
  });
  await waitLive('Aa');
  assert(await page.evaluate(six => window.__appShell.currentView().actualFeature.six !== six,physicalBefore),'实体跟随转动未重算');
  await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    vm.snapshot = null;
    localStorage.setItem('pll6ObservationMode','scan');
  });
  await page.reload();
  await mode.waitFor();
  assert(await mode.inputValue() === 'equality','旧 scan 偏好未迁移');
  return {modes:options,live:'U、切换 PLL、R 进入非 PLL、R 逆转恢复、实体跟随均重算',migration:'scan → equality'};
}
