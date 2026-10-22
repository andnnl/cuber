// 真实 WASM → XX/XXXCross 解法 → 3D 魔方重放 → 独立训练判定。
async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  const results = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const cases = ['R U F', "B' U2 R F'", "D' R B L U"];
    const out = [];
    vm.z2On = false;
    vm.baseOps = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.solveSlotMode = 'FIXED';
    for (const scramble of cases) {
      vm.syncScene(solved, 'wasm-xxcross-case');
      vm.world.cube.twister.setup(scramble);
      vm.world.cube.twister.finish();
      const initial = vm.world.cube.serialize();
      for (const pairCount of [2, 3]) {
        const found = await vm.analysisClient.request('solveMultiCross', {
          facelets: initial, pairCount, slots: 'ALL', maxSolutions: 4, maxDepth: 14,
        });
        if (!found.length) throw new Error(`${scramble} ${pairCount}: WASM 未返回候选`);
        for (const item of found) {
          if (item.slots.length < pairCount) throw new Error(`${scramble}: 槽位数不足 ${JSON.stringify(item)}`);
          vm.syncScene(initial, 'wasm-xxcross-replay');
          vm.world.cube.twister.setup(item.moves.join(' '));
          vm.world.cube.twister.finish();
          vm.trainMode = pairCount === 2 ? 'xxcross' : 'xxxcross';
          vm.selectedSolveSlots = item.slots.slice(0, pairCount);
          if (!vm.isTrainDone(vm.mapStateForJudge(vm.world.cube.serialize()))) {
            throw new Error(`${scramble} ${pairCount} ${item.moves.join(' ')}: 重放后目标未完成 ${item.slots}`);
          }
        }
        out.push({scramble, pairCount, count: found.length});
      }
    }
    return out;
  });
  console.log('WASM XX/XXXCross 全候选重放通过:', JSON.stringify(results));
}
