async page => {
  await page.goto("http://127.0.0.1:8080/?mode=blecross");
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);

  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.enterManual();
    vm.showBest = true;
    vm.phase = "observing";
    vm.solveBaseState = vm.world.cube.serialize();
    vm.solveBaseScreenFrame = true;
    vm.__solveCalls = [];
    vm.solver = {
      solveCross: async state => {
        vm.__solveCalls.push({ mode: "cross", state });
        return ["U R F D L B"];
      },
      solveXCross: async (state, slot) => {
        vm.__solveCalls.push({ mode: "xcross", state, slot });
        return [{ FL: "U R", FR: "F D", BL: "L B", BR: "U2 R2" }[slot]];
      },
    };
    vm.trainMode = "cross";
    vm.requestBest(vm.mapStateForJudge(vm.world.cube.serialize()));
  });
  await page.waitForFunction(() => window.__bleCross.bestReady);

  const requestId = () => page.evaluate(() => window.__bleCross.bestReqId);
  const callCount = () => page.evaluate(() => window.__bleCross.__solveCalls.length);
  const waitForCallsAfter = count => page.waitForFunction(n => window.__bleCross.__solveCalls.length > n, count);

  const initialView = await page.evaluate(() => JSON.stringify(window.__bleCross.bestViewOps));
  if (initialView !== "[]") {
    throw new Error(`标准视角的求解快照应为空，实际为 ${initialView}`);
  }

  const beforeMode = await callCount();
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = "xcross";
    vm.saveTrainMode();
  });
  await waitForCallsAfter(beforeMode);
  await page.waitForFunction(() => window.__bleCross.bestXReady);

  const beforeModeBack = await callCount();
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = "cross";
    vm.saveTrainMode();
  });
  await waitForCallsAfter(beforeModeBack);
  await page.waitForFunction(() => window.__bleCross.bestReady);
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = "xcross";
    vm.saveTrainMode();
  });
  await page.waitForFunction(() => window.__bleCross.bestXReady);

  for (const turns of [1, -1]) {
    const before = await requestId();
    await page.evaluate(t => {
      const vm = window.__bleCross;
      vm.rotateWholeY(t);
      vm.world.cube.twister.finish();
    }, turns);
    await page.waitForFunction(id => window.__bleCross.bestReqId > id, before);
    await page.waitForFunction(() => window.__bleCross.bestXReady);
  }

  const beforeZ2 = await requestId();
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.toggleZ2();
    vm.world.cube.twister.finish();
  });
  await page.waitForFunction(id => window.__bleCross.bestReqId > id, beforeZ2);
  await page.waitForFunction(() => window.__bleCross.bestXReady);
  const beforeZ2Back = await requestId();
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    vm.toggleZ2();
    vm.world.cube.twister.finish();
  });
  await page.waitForFunction(id => window.__bleCross.bestReqId > id, beforeZ2Back);
  await page.waitForFunction(() => window.__bleCross.bestXReady);

  const result = await page.evaluate(() => {
    const vm = window.__bleCross;
    return {
      count: vm.bestXDisplay.length,
      labels: vm.bestXDisplay.map(x => x.slot),
      formulas: vm.bestXDisplay.map(x => x.formula),
      requestView: JSON.stringify(vm.bestViewOps),
      currentView: JSON.stringify(vm.effectiveViewOps()),
      centers: [4, 13, 22, 31, 40, 49].map(i => vm.__solveCalls[vm.__solveCalls.length - 1].state[i]).join(""),
    };
  });
  if (result.count !== 4 || new Set(result.labels).size !== 4) {
    throw new Error(`XCross 当前槽位不完整: ${JSON.stringify(result)}`);
  }
  if (result.formulas.some(x => !x)) {
    throw new Error(`XCross 当前公式为空: ${JSON.stringify(result)}`);
  }
  if (result.requestView !== result.currentView) {
    throw new Error(`求解结果视图与当前视图不一致: ${JSON.stringify(result)}`);
  }
  if (new Set(result.centers).size !== 6) {
    throw new Error(`求解器收到的不是合法核心帧: ${JSON.stringify(result)}`);
  }

  const formulaFrame = await page.evaluate(() => {
    const vm = window.__bleCross;
    const core = vm.mapStateForJudge(vm.world.cube.serialize());
    const ops = vm.bestViewOps.map(op => ({ ...op }));
    const raw = vm.bestX[0].formula;
    const shown = vm.bestXDisplay[0].formula;
    vm.rebasing = true;

    vm.syncScene(core);
    vm.world.cube.twister.push(raw);
    vm.world.cube.twister.finish();
    const expected = vm.world.cube.serialize();

    vm.syncScene(core);
    for (const op of ops) {
      for (const group of vm.world.cube.table.groups[op.axis]) {
        group.twist(op.times * (Math.PI / 2), true);
      }
    }
    vm.world.cube.twister.push(shown);
    vm.world.cube.twister.finish();
    const actual = vm.mapStateForJudge(vm.world.cube.serialize());
    vm.rebasing = false;
    return { raw, shown, expected, actual };
  });
  if (formulaFrame.actual !== formulaFrame.expected) {
    throw new Error(`公式屏幕换名执行帧错误: ${JSON.stringify(formulaFrame)}`);
  }

  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = "cross";
    vm.requestBest(vm.mapStateForJudge(vm.world.cube.serialize()), vm.effectiveViewOps());
  });
  await page.waitForFunction(() => window.__bleCross.bestReady && window.__bleCross.bestSolution);

  const snapshotReady = await page.evaluate(() => {
    const vm = window.__bleCross;
    return typeof vm.bestBaseState === "string" && /^[URFDLB]{54}$/.test(vm.bestBaseState);
  });
  if (!snapshotReady) {
    throw new Error("求解结果没有保存公式预览所需的核心状态快照");
  }

  const waitForPreviewEnd = () =>
    page.waitForFunction(() => !window.__bleCross.playingBest, null, { timeout: 10000 });
  const previewExpected = (formula, count) =>
    page.evaluate(({ formula, count }) => {
      const vm = window.__bleCross;
      const shown = vm.bestMovesOf(formula).slice(0, count).join(" ");
      vm.rebasing = true;
      vm.syncScene(vm.bestBaseState);
      for (const op of vm.bestViewOps) {
        for (const group of vm.world.cube.table.groups[op.axis]) {
          group.twist(op.times * (Math.PI / 2), true);
        }
      }
      if (shown) {
        vm.world.cube.twister.push(shown);
        vm.world.cube.twister.finish();
      }
      const state = vm.world.cube.serialize();
      vm.rebasing = false;
      return state;
    }, { formula, count });

  const crossFormula = await page.evaluate(() => window.__bleCross.bestSolution);
  const crossCount = await page.evaluate(f => window.__bleCross.bestMovesOf(f).length, crossFormula);
  const crossExpected = await previewExpected(crossFormula, crossCount);
  const trainingBefore = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { moves: vm.moveCount, predicted: vm.predicted, phase: vm.phase };
  });
  await page.evaluate(formula => {
    const vm = window.__bleCross;
    vm.rebasing = true;
    vm.syncScene(vm.bestBaseState);
    vm.world.cube.twister.setup("R2 F");
    vm.rebasing = false;
    vm.bestStepPos = { [formula]: 2 };
    vm.playBest(formula);
  }, crossFormula);
  await waitForPreviewEnd();
  const crossReplay = await page.evaluate(formula => {
    const vm = window.__bleCross;
    return {
      state: vm.world.cube.serialize(),
      pos: vm.bestStepAt(formula),
      moves: vm.moveCount,
      predicted: vm.predicted,
      phase: vm.phase,
    };
  }, crossFormula);
  if (crossReplay.state !== crossExpected || crossReplay.pos !== crossCount) {
    throw new Error(`播放没有从求解快照第 1 步重播: ${JSON.stringify(crossReplay)}`);
  }
  if (
    crossReplay.moves !== trainingBefore.moves ||
    crossReplay.predicted !== trainingBefore.predicted ||
    crossReplay.phase !== trainingBefore.phase
  ) {
    throw new Error(`公式预览改动了训练状态: ${JSON.stringify({ trainingBefore, crossReplay })}`);
  }

  const crossPlayButton = page.getByRole("button", { name: "▶", exact: true });
  if (await crossPlayButton.isDisabled()) {
    throw new Error("完整播放结束后播放按钮被禁用，无法再次点击重播");
  }
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.rebasing = true;
    vm.world.cube.twister.setup("B2");
    vm.rebasing = false;
  });
  await crossPlayButton.click();
  await waitForPreviewEnd();
  const clickedReplay = await page.evaluate(() => window.__bleCross.world.cube.serialize());
  if (clickedReplay !== crossExpected) {
    throw new Error("再次点击播放按钮没有从求解快照重播");
  }

  const firstExpected = await previewExpected(crossFormula, 1);
  const baseExpected = await previewExpected(crossFormula, 0);
  await page.evaluate(formula => {
    const vm = window.__bleCross;
    vm.rebasing = true;
    vm.syncScene(vm.bestBaseState);
    vm.world.cube.twister.setup("L2 B");
    vm.rebasing = false;
    vm.bestStepPos = {};
    vm.stepBest(formula, 1);
  }, crossFormula);
  await waitForPreviewEnd();
  const firstState = await page.evaluate(() => window.__bleCross.world.cube.serialize());
  if (firstState !== firstExpected) {
    throw new Error("首个向前单步没有先恢复求解快照");
  }
  await page.evaluate(formula => window.__bleCross.stepBest(formula, -1), crossFormula);
  await waitForPreviewEnd();
  const back = await page.evaluate(formula => ({
    state: window.__bleCross.world.cube.serialize(),
    pos: window.__bleCross.bestStepAt(formula),
  }), crossFormula);
  if (back.state !== baseExpected || back.pos !== 0) {
    throw new Error(`回退首步后没有回到求解快照: ${JSON.stringify(back)}`);
  }

  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = "xcross";
    vm.requestBest(vm.mapStateForJudge(vm.world.cube.serialize()), vm.effectiveViewOps());
  });
  await page.waitForFunction(() => window.__bleCross.bestXReady && window.__bleCross.bestX.length === 4);
  const xFormulas = await page.evaluate(() => window.__bleCross.bestX.slice(0, 2).map(x => x.formula));
  await page.evaluate(formula => window.__bleCross.playBest(formula), xFormulas[0]);
  await waitForPreviewEnd();
  const xSecondCount = await page.evaluate(f => window.__bleCross.bestMovesOf(f).length, xFormulas[1]);
  const xSecondExpected = await previewExpected(xFormulas[1], xSecondCount);
  await page.evaluate(formula => window.__bleCross.playBest(formula), xFormulas[1]);
  await waitForPreviewEnd();
  const xSecondActual = await page.evaluate(() => window.__bleCross.world.cube.serialize());
  if (xSecondActual !== xSecondExpected) {
    throw new Error("切换 XCross 槽位播放时叠加了上一槽位的预览状态");
  }

  const staleBase = await page.evaluate(() => {
    const vm = window.__bleCross;
    if (vm.z2On) {
      vm.toggleZ2();
      vm.world.cube.twister.finish();
    }
    vm.isManual = false;
    vm.phase = "observing";
    vm.trainMode = "cross";
    vm.solveBaseState = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    vm.solveBaseScreenFrame = false;
    vm.world.cube.twister.push("R");
    vm.world.cube.twister.finish();
    const current = vm.mapStateForJudge(vm.world.cube.serialize());
    vm.trainMode = "xcross";
    vm.saveTrainMode();
    return { current };
  });
  await page.waitForFunction(() => window.__bleCross.bestXReady);
  const switchedState = await page.evaluate(() => {
    const calls = window.__bleCross.__solveCalls;
    return calls[calls.length - 1].state;
  });
  if (switchedState !== staleBase.current) {
    throw new Error("蓝牙模式切换没有基于当前 3D 状态重算");
  }

  for (const turns of [1, -1]) {
    const beforeBleY = await requestId();
    await page.evaluate(t => {
      const vm = window.__bleCross;
      vm.rotateWholeY(t);
      vm.world.cube.twister.finish();
    }, turns);
    await page.waitForTimeout(50);
    const afterBleY = await requestId();
    if (afterBleY <= beforeBleY) {
      throw new Error(`蓝牙 ${turns > 0 ? "y" : "y'"} 操作没有触发当前状态重算`);
    }
  }

  await page.reload();
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  await page.evaluate(async () => {
    const vm = window.__bleCross;
    vm.showBest = false;
    await vm.connect("mock");
  });
  await page.waitForFunction(() => window.__bleCross.status === "connected" && window.__bleCross.phase === "scrambling");
  await page.evaluate(() => window.__bleCross.skipScramble());
  await page.evaluate(() => window.__bleCross.link.mockApplyFormula("R"));
  await page.waitForFunction(() => window.__bleCross.phase === "solving" && window.__bleCross.moveCount === 1);

  for (let round = 0; round < 5; round++) {
    await page.evaluate(() => {
      const vm = window.__bleCross;
      vm.resetRound();
      vm.link.mockApplyFormula("U");
    });
    await page.waitForFunction(() => window.__bleCross.phase === "solving" && window.__bleCross.moveCount === 1);
    const resetStep = await page.evaluate(() => {
      const vm = window.__bleCross;
      vm.world.cube.twister.finish();
      return {
        moves: vm.moveCount,
        scene: vm.mapStateForJudge(vm.world.cube.serialize()),
        authoritative: vm.predicted,
      };
    });
    if (resetStep.moves !== 1 || resetStep.scene !== resetStep.authoritative) {
      throw new Error(`第 ${round + 1} 次重置后的首转被重复消费: ${JSON.stringify(resetStep)}`);
    }
  }
}
