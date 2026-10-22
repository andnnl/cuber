// 用户报告的长打乱，按真实开轮和按钮时序检查实体块身份。
async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.evaluate(async () => {
    const vm = window.__bleCross;
    const formula = "L2 B2 L2 B' R' F2 D' R2 B' U' F U L2 B2 D' R' F2 D L2 D' R' U2 R F' D' F D";
    const slots = { FL: ['F', 'L'], FR: ['F', 'R'], BL: ['B', 'L'], BR: ['B', 'R'] };
    const signature = (...colors) => colors.sort().join('');
    const assertVisibility = label => {
      const white = vm.z2On;
      const bottom = white ? 'U' : 'D';
      const wanted = new Set('FRBL'.split('').map(side => signature(bottom, side)));
      const selected = vm.selectedRecommendation?.physicalSlots;
      const training = vm.solveSlotMode === 'FIXED' ? vm.fixedTrainSlots() :
        selected?.length === (vm.trainMode === 'xxxcross' ? 3 : 2) ? selected :
          vm.bestXReady && vm.bestX[0]?.available ? vm.bestX[0].slot.split('+') : vm.fixedTrainSlots();
      for (const slot of training) {
        const physical = (vm.solveSlotMode === 'FIXED' || !selected?.length && !vm.bestXReady) && white
          ? slot[0] + (slot[1] === 'L' ? 'R' : 'L') : slot;
        wanted.add(signature(...slots[physical]));
        wanted.add(signature(bottom, ...slots[physical]));
      }
      vm.applyVisibility();
      const actual = [...vm.visibilityNeededSignatures].sort();
      const expected = [...wanted].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${label}: expected ${expected} got ${actual}; ops=${JSON.stringify(vm.effectiveViewOps())}`);
      }
      const positions = Array.from({ length: 27 }, () => ['', '', '', '', '', '']);
      const assign = (offset, positionsOnFace, face) => positionsOnFace.forEach((p, i) => {
        positions[p][face] = vm.world.cube.serialize()[offset + i];
      });
      assign(0, [6, 7, 8, 15, 16, 17, 24, 25, 26], 3);
      assign(9, [26, 17, 8, 23, 14, 5, 20, 11, 2], 1);
      assign(18, [24, 25, 26, 21, 22, 23, 18, 19, 20], 5);
      assign(27, [18, 19, 20, 9, 10, 11, 0, 1, 2], 2);
      assign(36, [6, 15, 24, 3, 12, 21, 0, 9, 18], 0);
      assign(45, [8, 7, 6, 5, 4, 3, 2, 1, 0], 4);
      const painted = [];
      for (let p = 0; p < 27; p++) {
        const colors = positions[p].filter(Boolean);
        if (colors.length < 2) continue;
        const faces = positions[p].map((color, face) => color ? face : -1).filter(face => face >= 0);
        const piece = vm.world.cube.cubelets[p];
        const bright = faces.every(face => piece.stickers[piece.getFace(face)]?.material?.isMeshBasicMaterial);
        if (bright) painted.push(signature(...colors));
      }
      if (JSON.stringify(painted.sort()) !== JSON.stringify(expected)) {
        throw new Error(`${label}: 高亮块应为 ${expected}，实际 ${painted.sort()}，样本=${positions.map((cs,p)=>({p,cs:cs.filter(Boolean).join(''),m:vm.world.cube.cubelets[p]?.stickers?.map(s=>s?.material?.type)})).filter(a=>a.cs.length>1).slice(0,4).map(a=>JSON.stringify(a)).join(';')}`);
      }
    };
    vm.world.cube.twister.finish();
    vm.z2On = false;
    vm.baseOps = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.visHide = true;
    vm.visGhost = true;
    vm.showBest = true;
    vm.trainMode = 'xxcross';
    vm.solveSlotMode = 'ALL';
    vm.selectedSolveSlots = ['FR', 'BL'];
    vm.startScramble(formula);
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    vm.rotateWholeY(1);
    vm.world.cube.twister.finish();
    for (let n = 0; n < 100 && !vm.bestXReady; n++) await new Promise(resolve => setTimeout(resolve, 50));
    if (!vm.bestX.length) throw new Error('指定打乱没有最优 XXCross 候选');
    const bestSlots = vm.bestX[0].slot.split('+');
    const expectedBest = new Set('FRBL'.split('').map(side => signature('U', side)));
    for (const slot of bestSlots) {
      expectedBest.add(signature(...slots[slot]));
      expectedBest.add(signature('U', ...slots[slot]));
    }
    const actualBest = [...vm.visibilityNeededSignatures].sort();
    if (JSON.stringify(actualBest) !== JSON.stringify([...expectedBest].sort())) {
      throw new Error(`z2 y 无手选推荐时应跟随首条最优解 ${bestSlots}，实际 ${actualBest}`);
    }
    vm.trainMode = 'xxcross';
    vm.solveSlotMode = 'ALL';
    vm.selectedSolveSlots = ['FR', 'BL'];
    vm.startScramble(formula);
    await vm.openRecommendations();
    if (!vm.recommendations.length) throw new Error(`黄底没有 XXCross 推荐 ${vm.recommendationError}`);
    vm.selectRecommendation(vm.recommendations[0]);
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    if (vm.selectedRecommendationId) {
      throw new Error(`z2 已换底色，但仍沿用黄底解法和槽位 ${vm.selectedRecommendation.physicalSlots}`);
    }
    assertVisibility('selected before z2 must reset to white targets');
    for (const mode of ['xxcross', 'xxxcross']) {
      for (const selection of ['ALL', 'FIXED']) {
        vm.trainMode = mode;
        vm.solveSlotMode = selection;
        vm.selectedSolveSlots = ['FR', 'BL', 'FL'];
        vm.startScramble(formula);
        assertVisibility(`${mode}/${selection}: scramble`);
        vm.toggleZ2();
        vm.world.cube.twister.finish();
        assertVisibility(`${mode}/${selection}: z2`);
        vm.rotateWholeY(1);
        vm.world.cube.twister.finish();
        assertVisibility(`${mode}/${selection}: z2 y`);
        vm.startScramble(formula);
        assertVisibility(`${mode}/${selection}: new scramble preserving z2 y`);
        if (selection === 'ALL') {
          await vm.openRecommendations();
          if (!vm.recommendations.length) throw new Error(`没有 ${mode} 推荐 ${vm.recommendationError}`);
          vm.selectRecommendation(vm.recommendations[0]);
          assertVisibility(`${mode}: selected after z2 y`);
          vm.rotateWholeY(-1);
          vm.world.cube.twister.finish();
          assertVisibility(`${mode}: selected then y'`);
        }
      }
    }
    // 单组与多组不能混用「屏幕槽名」和「核心槽名」；先 y 再 z2 也要保留实体身份。
    for (const selection of ['ALL', 'FIXED']) {
      vm.z2On = false;
      vm.baseOps = [];
      vm.observedOps = [];
      vm.z2Marks = [];
      vm.syncScene('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', 'xcross-visibility-test');
      vm.trainMode = 'xcross';
      vm.solveSlotMode = selection;
      vm.solveSlot = 'FR';
      vm.visSlot = 'FR';
      vm.startScramble(formula);
      vm.rotateWholeY(1);
      vm.world.cube.twister.finish();
      vm.toggleZ2();
      vm.world.cube.twister.finish();
      vm.applyVisibility();
      const wanted = ['BU', 'FU', 'LU', 'RU'];
      const slot = selection === 'FIXED' ? 'FL' : 'FR';
      wanted.push(signature(...slots[slot]), signature('U', ...slots[slot]));
      const actual = [...vm.visibilityNeededSignatures].sort();
      if (JSON.stringify(actual) !== JSON.stringify(wanted.sort())) {
        throw new Error(`xcross/${selection}: y z2 目标错误，expected ${wanted.sort()} got ${actual}, screen=${vm.world.cube.serialize()}, ops=${JSON.stringify(vm.effectiveViewOps())}`);
      }
      if (selection === 'FIXED') {
        vm.world.cube.twister.push('x');
        vm.world.cube.twister.finish();
        vm.applyVisibility();
        const afterDrag = [...vm.visibilityNeededSignatures].sort();
        if (JSON.stringify(afterDrag) !== JSON.stringify(wanted.sort())) {
          throw new Error(`xcross/FIXED: z2/y 后拖动 x 丢失目标块，expected ${wanted.sort()} got ${afterDrag}`);
        }
      }
    }
  });
}
