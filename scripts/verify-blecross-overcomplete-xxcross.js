// XXCross 可接受顺带完成第三槽的 WASM 解法，但推荐与训练目标仍须只选两槽。
async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  const result = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    vm.syncScene(solved, 'overcomplete-test');
    vm.world.cube.twister.setup('R U F');
    vm.world.cube.twister.finish();
    vm.analysisCoreBase = vm.world.cube.serialize();
    vm.z2On = false;
    vm.baseOps = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.trainMode = 'xxcross';
    const original = vm.analysisClient.request.bind(vm.analysisClient);
    vm.analysisClient.request = (type, args) => type === 'solveMultiCross'
      ? Promise.resolve([{ moves: ["F'", "R'"], slots: ['FL', 'BR', 'BL'] }])
      : original(type, args);
    const results = [];
    try {
      for (const selection of ['ALL', 'FIXED']) {
        vm.solveSlotMode = selection;
        vm.selectedSolveSlots = ['BR', 'FL'];
        vm.recommendationOpen = false;
        vm.recommendations = [];
        await vm.openRecommendations();
        const items = vm.recommendations;
        if (!items.length || items.some(item => item.physicalSlots.length !== 2)) {
          throw new Error(`${selection}: 应接受额外完成槽位的解法，推荐仍只展示两槽: ${vm.recommendationError} / ${items.length}`);
        }
        if (selection === 'FIXED' && items.some(item => item.physicalSlots.join(',') !== 'BR,FL')) {
          throw new Error('指定槽位应按选择次序展示 BR,FL');
        }
        results.push({ selection, count: items.length, slots: items[0].physicalSlots });
      }
    } finally {
      vm.analysisClient.request = original;
    }
    return results;
  });
  console.log('XXCross 超额完成槽位推荐:', JSON.stringify(result));
}
