async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  const result = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    vm.world.cube.twister.finish();
    vm.z2On = false;
    vm.baseOps = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.syncScene(solved, 'multi-visibility-test');
    vm.visGhost = true;
    vm.visHide = true;
    vm.solveSlotMode = 'ALL';
    vm.selectedSolveSlots = ['FR', 'BL', 'FL'];
    vm.recommendations = [];
    vm.selectedRecommendationId = null;
    const capture = () => {
      vm.invalidateVisibilityTargets();
      vm.applyVisibility();
      return Array.from(vm.visibilityNeededSignatures || []).sort();
    };
    vm.trainMode = 'xxcross';
    const xxUnselected = capture();
    await vm.$nextTick();
    const misleadingSingleSlotSelect = !!document.querySelector('select[title^="XCross:"]');
    vm.trainMode = 'xxxcross';
    const xxxUnselected = capture();
    vm.trainMode = 'xxcross';
    const pair = (id, physicalSlots) => ({ id, physicalSlots, physicalMoves: [] });
    const xx = pair('xx', ['FL', 'BR']);
    vm.recommendations = [xx];
    vm.selectRecommendation(xx);
    const xxSelected = capture();
    vm.trainMode = 'xxxcross';
    const xxx = pair('xxx', ['FL', 'FR', 'BR']);
    vm.recommendations = [xxx];
    vm.selectRecommendation(xxx);
    const xxxSelected = capture();
    vm.solveSlotMode = 'FIXED';
    vm.selectedSolveSlots = ['FL', 'BR'];
    vm.trainMode = 'xxcross';
    const xxFixed = capture();
    vm.solveSlotMode = 'ALL';
    vm.recommendations = [xx];
    vm.selectRecommendation(xx);
    vm.rotateWholeY(1);
    vm.world.cube.twister.finish();
    const xxAfterY = capture();
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    vm.trainMode = 'xxcross';
    vm.solveSlotMode = 'FIXED';
    const xxWhiteFixed = capture();
    return { xxUnselected, xxxUnselected, xxSelected, xxxSelected, xxFixed, xxAfterY, xxWhiteFixed, misleadingSingleSlotSelect };
  });
  const cross = ['BD', 'DF', 'DL', 'DR'];
  const pairs = { FL: ['FL', 'DFL'], FR: ['FR', 'DFR'], BL: ['BL', 'BDL'], BR: ['BR', 'BDR'] };
  const expected = (...slots) => [...cross, ...slots.flatMap(slot => pairs[slot])].sort();
  const cases = {
    xxUnselected: expected('FR', 'BL'),
    xxxUnselected: expected('FR', 'BL', 'FL'),
    xxSelected: expected('FL', 'BR'),
    xxxSelected: expected('FL', 'FR', 'BR'),
    xxFixed: expected('FL', 'BR'),
    xxAfterY: expected('FL', 'BR'),
    xxWhiteFixed: ['BU', 'FU', 'LU', 'RU', 'FR', 'FRU', 'BL', 'BLU'].sort(),
  };
  for (const [name, wanted] of Object.entries(cases)) {
    if (JSON.stringify(result[name]) !== JSON.stringify(wanted)) {
      throw new Error(`${name}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(result[name])}`);
    }
  }
  if (result.misleadingSingleSlotSelect) throw new Error('XXCross 不应显示只对 XCross 生效的单槽位选择器');
  console.log('XXCross/XXXCross 可视目标: 任意槽位、已选推荐、指定槽位均正确');
}
