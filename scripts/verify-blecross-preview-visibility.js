// 任意槽位下切换不同最优解的播放/步进，高亮应跟随当前公式目标。
async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.world.cube.twister.finish();
    vm.z2On = false;
    vm.baseOps = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.trainMode = 'xxcross';
    vm.solveSlotMode = 'ALL';
    vm.selectedSolveSlots = ['FR', 'BL'];
    vm.visHide = true;
    vm.visGhost = true;
    vm.startScramble("R U F");
    vm.bestX = [
      { slot: 'FR+BL', formula: "F' R'", steps: 2, available: true },
      { slot: 'FL+BR', formula: "F' U' R'", steps: 3, available: true },
    ];
    vm.bestXReady = true;
    vm.bestBaseState = vm.mapStateForJudge(vm.world.cube.serialize());
    vm.bestViewOps = vm.effectiveViewOps().map(op => ({ ...op }));
    const expected = (...slots) => {
      const pair = { FL: ['FL', 'DFL'], FR: ['FR', 'DFR'], BL: ['BL', 'BDL'], BR: ['BR', 'BDR'] };
      return ['BD', 'DF', 'DL', 'DR', ...slots.flatMap(slot => pair[slot])].sort();
    };
    const assertTargets = (label, slots) => {
      const actual = [...(vm.visibilityNeededSignatures || [])].sort();
      const wanted = expected(...slots);
      if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
        throw new Error(`${label}: expected ${wanted}; actual ${actual}`);
      }
    };
    vm.invalidateVisibilityTargets();
    vm.applyVisibility();
    assertTargets('起点第一条', ['FR', 'BL']);
    vm.playBest(vm.bestX[1].formula);
    assertTargets('播放第二条', ['FL', 'BR']);
    vm.world.cube.twister.finish();
    vm.cancelBestPlay();
    vm.stepBest(vm.bestX[0].formula, 1);
    assertTargets('步进第一条', ['FR', 'BL']);
    vm.world.cube.twister.finish();
    vm.cancelBestPlay();
    const card = { id: 'other-front', front: 'F', physicalMoves: ["F'", "U'"], displayMoves: ["F'", "U'"], physicalSlots: ['FL', 'BR'] };
    vm.playBest(card.physicalMoves.join(' '), card);
    assertTargets('推荐卡片播放', ['FL', 'BR']);
    vm.world.cube.twister.finish();
    vm.cancelBestPlay();
    vm.solveSlotMode = 'FIXED';
    vm.selectedSolveSlots = ['FR', 'BL'];
    vm.invalidateVisibilityTargets();
    vm.applyVisibility();
    vm.playBest(vm.bestX[1].formula);
    assertTargets('指定槽位仍固定', ['FR', 'BL']);
    vm.world.cube.twister.finish();
    vm.cancelBestPlay();
    vm.trainMode = 'xcross';
    vm.solveSlotMode = 'ALL';
    vm.visSlot = 'FL';
    vm.bestX = [
      { slot: 'FL', formula: "F' R'", steps: 2, available: true },
      { slot: 'BR', formula: "F' U' R'", steps: 3, available: true },
    ];
    vm.invalidateVisibilityTargets();
    vm.applyVisibility();
    assertTargets('单组起点', ['FL']);
    vm.playBest(vm.bestX[1].formula);
    assertTargets('单组播放另一槽位', ['BR']);
  });
}
