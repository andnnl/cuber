async page => {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:18098/?mode=pll6');
  await page.locator('.pll6-root').waitFor();
  await page.evaluate(() => localStorage.removeItem('pll6ObservationMode'));
  await page.reload();
  const mode = page.getByRole('combobox', {name:'观察方式'});
  await mode.waitFor();
  assert(await mode.inputValue() === 'equality', '新版不是首次默认方式');
  await page.getByRole('checkbox', {name:'显示当前特征'}).check();
  await page.getByRole('button', {name:'学习观察法', exact:true}).click();
  assert(await page.locator('.pll6-equality-chapter').count() === 5, '缺少左侧五形态');
  assert(await page.locator('.pll6-equality-card').count() === 54, '同色模式数错误');
  assert(await page.locator('.pll6-equality-conflicts tbody tr').count() === 12, '冲突速查数错误');
  const samples = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    const checked = [];
    for (const reference of [null,2,4,5]) for (const z2 of [false,true]) {
      const group = vm.equalityStudyGroups.find(group => reference === null ? !group.final : group.final?.a === reference);
      const sample = group.cases[0];
      const choice = vm.choices.find(choice => choice.name === `PLL-${sample.name}`);
      vm.useZ2 = z2;
      vm.training.setZ2(z2);
      vm.world.cube.twister.setup([z2 ? 'z2' : '', vm.training.invert(choice.origin), sample.auf === '无' ? '' : sample.auf].filter(Boolean).join(' '));
      vm.refreshActualFeature();
      const plan = vm.equalityPlan;
      if (!plan || plan.pattern !== group.pattern || plan.name !== sample.name || (plan.final?.a ?? null) !== reference)
        throw Error(`同色分组不匹配 ${reference} ${z2}`);
      const relations = vm.visualClues.filter(clue => clue.kind === 'relation');
      if (relations.length !== (reference === null ? 0 : 1) || vm.shapeEdges.length)
        throw Error('绘制了额外的复杂关系');
      if (vm.visualClues.filter(clue => clue.kind !== 'relation').some(clue => clue.segments.some(segment => segment.relation !== '同')))
        throw Error('同色阶段出现邻/对色');
      checked.push({pattern:plan.pattern,reference,z2,name:plan.name});
    }
    return checked;
  });
  const hint = await page.locator('.pll6-feature-hint').innerText();
  assert(!/PLL|→/.test(hint), '当前提示提前展示答案');
  assert(hint.includes('三段观察流程不等于三次两格比较'), '缺少计数边界说明');
  const before = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    return {facelets:vm.world.cube.serialize(),started:vm.training.startedAt};
  });
  await mode.selectOption('legacy');
  assert(await page.getByRole('heading', {name:'九类判断特征'}).count() === 1, '旧版丢失');
  assert(await page.locator('.pll6-study > details').count() === 10, '旧版九章/完整资料丢失');
  await mode.selectOption('equality');
  assert(await page.evaluate(before => {
    const vm = window.__appShell.currentView();
    return vm.world.cube.serialize() === before.facelets && vm.training.startedAt === before.started;
  },before), '切换方式改变题面或计时');
  const preview = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    const oldSnapshot = vm.snapshot;
    vm.snapshot = {status:'connected'};
    vm.handlePhysicalEvent({type:'move',move:'R',serial:999999},true);
    vm.world.cube.twister.finish();
    vm.refreshActualFeature();
    const updated = vm.actualFeature === null && vm.visualClues.length === 0 && vm.stickerPoints.length === 0;
    vm.snapshot = oldSnapshot;
    return updated;
  });
  assert(preview, '实体转入非 PLL 后未清除旧特征');
  for (const width of [360,390]) {
    await page.setViewportSize({width,height:844});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `手机 ${width}px 横向溢出`);
  }
  await page.reload();
  await mode.waitFor();
  assert(await mode.inputValue() === 'equality', '新版偏好未保存');
  assert(errors.length === 0, errors.join('\n'));
  return {patterns:54,conflicts:12,samples,legacy:'保留',preview:'非 PLL 清除旧特征',mobile:'360/390px 通过',errors};
}
