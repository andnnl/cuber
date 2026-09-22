async page => {
  await page.goto("http://127.0.0.1:8080/?mode=blecross");
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);

  const background = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const before = vm.world.cube.serialize();
    vm.setBackgroundColor("#121212");
    await vm.$nextTick();
    const wrapper = document.querySelector("[data-ble-background]");
    return {
      presets: vm.backgroundPresets.map(item => item.value),
      domPresets: document.querySelectorAll("[data-ble-bg-preset]").length,
      hasCustom: !!document.querySelector("[data-ble-bg-custom]"),
      style: wrapper ? getComputedStyle(wrapper).backgroundColor : "missing",
      saved: localStorage.getItem("bleBackgroundColor"),
      gif: vm.gifBackColor(),
      unchanged: before === vm.world.cube.serialize(),
    };
  });
  if (
    JSON.stringify(background.presets) !== JSON.stringify([
      "#FFFFFF",
      "#F3F4F6",
      "#FFF8E7",
      "#FFFDE7",
      "#E8F5E9",
      "#465255",
      "#48515E",
      "#514B5B",
      "#5D4C53",
      "#121212",
    ]) ||
    background.domPresets !== 10 ||
    !background.hasCustom ||
    background.style !== "rgb(18, 18, 18)" ||
    background.saved !== "#121212" ||
    background.gif !== 0x121212 ||
    !background.unchanged
  ) {
    throw new Error(`BLE Cross 背景色预设或局部渲染异常: ${JSON.stringify(background)}`);
  }

  await page.evaluate(() => window.__bleCross.setBackgroundColor("#a1b2c3"));
  await page.reload();
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  const restoredBackground = await page.evaluate(() => {
    const vm = window.__bleCross;
    const wrapper = document.querySelector("[data-ble-background]");
    return {
      value: vm.backgroundColor,
      style: wrapper ? getComputedStyle(wrapper).backgroundColor : "missing",
      saved: localStorage.getItem("bleBackgroundColor"),
    };
  });
  if (
    restoredBackground.value !== "#A1B2C3" ||
    restoredBackground.style !== "rgb(161, 178, 195)" ||
    restoredBackground.saved !== "#A1B2C3"
  ) {
    throw new Error(`BLE Cross 自定义背景没有刷新恢复: ${JSON.stringify(restoredBackground)}`);
  }

  await page.evaluate(() => localStorage.setItem("bleBackgroundColor", "not-a-color"));
  await page.reload();
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  const invalidBackground = await page.evaluate(() => {
    const vm = window.__bleCross;
    const wrapper = document.querySelector("[data-ble-background]");
    const result = {
      value: vm.backgroundColor,
      style: wrapper ? getComputedStyle(wrapper).backgroundColor : "missing",
    };
    vm.setBackgroundColor("#FFFFFF");
    return result;
  });
  if (invalidBackground.value !== "#FFFFFF" || invalidBackground.style !== "rgb(255, 255, 255)") {
    throw new Error(`BLE Cross 非法背景没有回退白色: ${JSON.stringify(invalidBackground)}`);
  }

  const observationRecords = await page.evaluate(() => {
    const vm = window.__bleCross;
    const realNow = Date.now;
    const saveRecords = vm.saveRecords.bind(vm);
    vm.records = [];
    vm.recLimit = 20;
    vm.saveRecords = () => {};
    try {
      Date.now = () => 15000;
      vm.isManual = false;
      vm.observeStart = 10000;
      vm.solveStart = 12500;
      vm.recordTrain(true);

      Date.now = () => 25000;
      vm.isManual = true;
      vm.observeStart = 20000;
      vm.solveStart = 22000;
      vm.recordTrain(true);

      Date.now = () => 30000;
      vm.observeStart = 0;
      vm.solveStart = 0;
      vm.recordTrain(false);

      return {
        bluetoothObs: vm.records[2].obs,
        manualObs: vm.records[1].obs,
        missingObs: vm.records[0].obs,
        formattedBluetooth: vm.fmtRecSec(vm.records[2].obs),
        formattedMissing: vm.fmtRecSec(vm.records[0].obs),
        avgObs: vm.recStats.avgObs,
      };
    } finally {
      Date.now = realNow;
      vm.saveRecords = saveRecords;
      vm.records = [];
    }
  });
  if (
    observationRecords.bluetoothObs !== 2.5 ||
    observationRecords.manualObs !== 2 ||
    observationRecords.missingObs !== null ||
    observationRecords.formattedBluetooth !== "2.5s" ||
    observationRecords.formattedMissing !== "-" ||
    observationRecords.avgObs !== "2.3s"
  ) {
    throw new Error(`训练记录观察用时异常: ${JSON.stringify(observationRecords)}`);
  }

  const centerGhost = await page.evaluate(() => {
    const vm = window.__bleCross;
    const centers = [4, 10, 12, 14, 16, 22];
    const inspect = () =>
      centers.map(position => {
        const piece = vm.world.cube.cubelets[position];
        const sticker = piece.stickers.find(Boolean);
        return {
          opacity: sticker.material.opacity,
          transparent: sticker.material.transparent,
          frameVisible: piece.frame.visible,
        };
      });
    vm.visGhost = true;
    vm.visHide = false;
    vm.applyVisibility();
    const ghost = inspect();
    vm.visGhost = false;
    vm.applyVisibility();
    return { ghost, restored: inspect(), state: vm.world.cube.serialize() };
  });
  if (
    centerGhost.ghost.length !== 6 ||
    centerGhost.ghost.some(x => x.opacity !== 0.8 || !x.transparent || x.frameVisible) ||
    centerGhost.restored.some(x => x.opacity !== 1 || x.transparent || !x.frameVisible) ||
    centerGhost.state !== "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
  ) {
    throw new Error(`半透明模式中心块不是 80% 或恢复异常: ${JSON.stringify(centerGhost)}`);
  }

  const hideGray = await page.evaluate(() => {
    const vm = window.__bleCross;
    const before = vm.world.cube.serialize();
    const centers = new Set([4, 10, 12, 14, 16, 22]);
    vm.visGhost = false;
    vm.visHide = true;
    vm.applyVisibility();
    const soft = [];
    const centerStickers = [];
    let coloredOpaque = 0;
    vm.world.cube.cubelets.forEach((piece, position) => {
      if (!piece || !piece.exist) return;
      piece.stickers.filter(Boolean).forEach(sticker => {
        const material = sticker.material;
        const sample = {
          color: material.color.getHex(),
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        };
        if (material.transparent && material.depthWrite === false) soft.push(sample);
        if (centers.has(position)) centerStickers.push(sample);
        if (!material.transparent && sample.color !== 0x80868b) coloredOpaque++;
      });
    });
    const active = vm.world.cube.serialize();
    vm.visHide = false;
    vm.applyVisibility();
    return {
      soft,
      centerStickers,
      coloredOpaque,
      before,
      active,
      restored: vm.world.cube.serialize(),
    };
  });
  if (
    hideGray.soft.length === 0 ||
    hideGray.soft.some(
      x => x.color !== 0x80868b || x.opacity !== 0.1 || !x.transparent || x.depthWrite !== false
    ) ||
    hideGray.centerStickers.length !== 6 ||
    hideGray.centerStickers.some(x => x.color === 0x80868b || x.transparent || x.opacity !== 1) ||
    hideGray.coloredOpaque === 0 ||
    hideGray.active !== hideGray.before ||
    hideGray.restored !== hideGray.before ||
    hideGray.active.includes("?")
  ) {
    throw new Error(`隐藏无关贴纸没有统一灰化或破坏了真实状态: ${JSON.stringify(hideGray)}`);
  }

  const liveFrame = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.isManual = false;
    vm.autoNext = false;
    vm.isTrainDone = () => false;
    vm.phase = "solving";
    vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    vm.solveBaseState = "";
    vm.needBreak = true;
    vm.observedOps = [];
    vm.baseOps = [];
    vm.z2Marks = [];
    vm.z2On = false;
    vm.syncScene(vm.predicted);
    vm.userSolution = "";
    vm.moveCount = 0;

    vm.onMoveEvent("D");
    vm.world.cube.twister.finish();
    const beforeZ2 = vm.liveStepsText;
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    const afterZ2 = vm.liveStepsText;
    vm.onMoveEvent("D");
    vm.world.cube.twister.finish();
    return {
      beforeZ2,
      afterZ2,
      afterSecond: vm.liveStepsText,
    };
  });
  if (
    liveFrame.beforeZ2 !== "D" ||
    liveFrame.afterZ2 !== "D" ||
    liveFrame.afterSecond !== "D U"
  ) {
    throw new Error(`蓝牙步骤没有固定事件时视角: ${JSON.stringify(liveFrame)}`);
  }

  const segmented = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.autoNext = false;
    vm.isTrainDone = () => false;
    const reset = () => {
      vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
      vm.phase = "solving";
      vm.needBreak = true;
      vm.observedOps = [];
      vm.baseOps = [];
      vm.z2Marks = [];
      vm.z2On = false;
      vm.syncScene(vm.predicted);
      vm.userSolution = "";
      vm.moveCount = 0;
    };
    reset();
    vm.onMoveEvent("D");
    vm.world.cube.twister.finish();
    vm.onMoveEvent("D");
    vm.world.cube.twister.finish();
    const sameView = vm.liveStepsText;
    reset();
    vm.onMoveEvent("D");
    vm.world.cube.twister.finish();
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    vm.onMoveEvent("D");
    vm.world.cube.twister.finish();
    return { sameView, splitView: vm.liveStepsText };
  });
  if (segmented.sameView !== "D2" || segmented.splitView !== "D U") {
    throw new Error(`蓝牙显示步骤分段化简错误: ${JSON.stringify(segmented)}`);
  }

  const mixedView = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.autoNext = false;
    vm.isTrainDone = () => false;
    vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    vm.phase = "solving";
    vm.needBreak = true;
    vm.observedOps = [];
    vm.baseOps = [];
    vm.z2Marks = [];
    vm.z2On = false;
    vm.syncScene(vm.predicted);
    vm.userSolution = "";
    vm.moveCount = 0;
    vm.onMoveEvent("R");
    vm.world.cube.twister.finish();
    vm.rotateWholeY(1);
    vm.world.cube.twister.finish();
    const secondExpected = vm.displayMove("F");
    vm.onMoveEvent("F");
    vm.world.cube.twister.finish();
    const live = vm.liveStepsText;
    vm.rotateWholeY(-1);
    vm.world.cube.twister.finish();
    const afterYBack = vm.liveStepsText;
    vm.phase = "success";
    const success = vm.userSolutionText;
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    return {
      secondExpected,
      live,
      afterYBack,
      success,
      afterFinalZ2: vm.userSolutionText,
    };
  });
  const expectedMixed = `R ${mixedView.secondExpected}`;
  if (
    mixedView.live !== expectedMixed ||
    mixedView.afterYBack !== expectedMixed ||
    mixedView.success !== expectedMixed ||
    mixedView.afterFinalZ2 !== expectedMixed
  ) {
    throw new Error(`y/y′ 或完成态重写了蓝牙历史: ${JSON.stringify(mixedView)}`);
  }

  await page.reload();
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
    vm.autoNext = false;
    await vm.connect("mock");
  });
  await page.waitForFunction(
    () =>
      window.__bleCross.status === "connected" &&
      window.__bleCross.phase === "observing" &&
      !window.__bleCross.bleRoundSyncPending
  );
  await page.evaluate(() => window.__bleCross.link.mockApplyFormula("R"));
  await page.waitForFunction(() => window.__bleCross.phase === "solving" && window.__bleCross.moveCount === 1);
  const firstMoveRace = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const requestFacelets = vm.link.requestFacelets.bind(vm.link);
    vm.link.requestFacelets = async () => {};
    const base = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    const afterR = "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB";
    const reset = serial => {
      vm.clearBleBaselineHeal();
      vm.autoNext = false;
      vm.isTrainDone = () => false;
      vm.z2On = false;
      vm.baseOps = [];
      vm.observedOps = [];
      vm.z2Marks = [];
      vm.isManual = false;
      vm.status = "connected";
      vm.phase = "observing";
      vm.predicted = base;
      vm.solveBaseState = "";
      vm.moveCount = 0;
      vm.userSolution = "";
      vm.bleEventSerial = serial;
      vm.bleMoveSerial = serial;
      vm.bleAuthoritativeSerial = serial;
      vm.bleRoundSyncPending = true;
      vm.bleSessionBaselinePending = false;
      vm.syncScene(base);
    };

    // 实时首步先于基线返回：必须立即走统一动画和计步路径。
    reset(120);
    vm.handleEvent({ type: "move", move: "R", serial: 121, recovered: false });
    vm.world.cube.twister.finish();
    const liveBeforeBaseline = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      phase: vm.phase,
    };
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 121 });
    vm.world.cube.twister.finish();
    const liveAfterBaseline = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      phase: vm.phase,
    };

    // 历史恢复动作不得开始新轮；基线负责把断档画面收敛到实体真态。
    reset(130);
    vm.handleEvent({ type: "move", move: "R", serial: 131, recovered: true });
    vm.world.cube.twister.finish();
    const recoveredBeforeBaseline = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      phase: vm.phase,
    };
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 131 });
    await new Promise(resolve => setTimeout(resolve, 220));
    vm.world.cube.twister.finish();
    const recoveredAfterBaseline = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      phase: vm.phase,
    };

    // 基线先到、同序号实时 MOVE 后到：应以 coveredByAuthoritative 只镜像一次。
    reset(139);
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 140 });
    vm.handleEvent({ type: "move", move: "R", serial: 140, recovered: false });
    vm.world.cube.twister.finish();
    const faceletsFirst = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      phase: vm.phase,
    };

    // 基线同序号 MOVE 丢失、下一实时 MOVE 先到：须先补齐基线画面，再播放新动作。
    reset(149);
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 150 });
    vm.handleEvent({ type: "move", move: "U", serial: 151, recovered: false });
    vm.world.cube.twister.finish();
    const afterRU = "UUUUUUFFFUBBRRRRRRRRRFFDFFDDDBDDBDDBFFDLLLLLLLLLUBBUBB";
    const nextLiveAfterBaseline = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      phase: vm.phase,
    };

    // 历史恢复 MOVE 已失去实时输入语义，不得在训练中突然批量追加到 3D/history。
    reset(159);
    vm.bleRoundSyncPending = false;
    vm.handleEvent({ type: "move", move: "R", serial: 160, recovered: true });
    vm.world.cube.twister.finish();
    const recoveredDuringTraining = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      phase: vm.phase,
    };

    // 两个实时 MOVE 已被消费后，较旧的轮次基线不得把状态和序号回退。
    reset(170);
    vm.handleEvent({ type: "move", move: "R", serial: 171, recovered: false });
    vm.handleEvent({ type: "move", move: "U", serial: 172, recovered: false });
    vm.world.cube.twister.finish();
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 171 });
    await new Promise(resolve => setTimeout(resolve, 220));
    vm.world.cube.twister.finish();
    const multiMoveBeforeOldBaseline = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      eventSerial: vm.bleEventSerial,
    };

    // 8 位序号 255→0 必须视为向前一步，不能误判成旧事件。
    reset(255);
    vm.bleRoundSyncPending = false;
    vm.handleEvent({ type: "move", move: "R", serial: 0, recovered: false });
    vm.world.cube.twister.finish();
    const serialWrap = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      eventSerial: vm.bleEventSerial,
    };

    // 同序号 MOVE 重复通知只能消费一次。
    reset(40);
    vm.bleRoundSyncPending = false;
    vm.handleEvent({ type: "move", move: "R", serial: 41, recovered: false });
    vm.handleEvent({ type: "move", move: "R", serial: 41, recovered: false });
    vm.world.cube.twister.finish();
    const duplicateMove = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
    };

    // Gen3/Gen4 FACELETS 常用 s=0 作为无序号快照。轮次基线不得因此把 MOVE 序号
    // 从 129 回退到 0，否则 130..255 会被连续误判为旧通知。
    reset(129);
    vm.handleEvent({ type: "facelets", facelets: base, serial: 0 });
    vm.handleEvent({ type: "move", move: "R", serial: 130, recovered: false });
    vm.world.cube.twister.finish();
    const zeroSnapshotThenMove = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      eventSerial: vm.bleEventSerial,
    };

    // 普通训练中的旧 FACELETS 不得回拉已推进的实体与画面。
    reset(50);
    vm.bleRoundSyncPending = false;
    vm.predicted = afterR;
    vm.syncScene(afterR);
    vm.lastBleMoveAt = Date.now();
    vm.handleEvent({ type: "facelets", facelets: base, serial: 49 });
    vm.world.cube.twister.finish();
    const staleFacelets = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      eventSerial: vm.bleEventSerial,
    };
    vm.link.requestFacelets = requestFacelets;

    return {
      base,
      afterR,
      afterRU,
      liveBeforeBaseline,
      liveAfterBaseline,
      recoveredBeforeBaseline,
      recoveredAfterBaseline,
      faceletsFirst,
      nextLiveAfterBaseline,
      recoveredDuringTraining,
      multiMoveBeforeOldBaseline,
      serialWrap,
      duplicateMove,
      zeroSnapshotThenMove,
      staleFacelets,
    };
  });
  if (
    firstMoveRace.liveBeforeBaseline.predicted !== firstMoveRace.afterR ||
    firstMoveRace.liveBeforeBaseline.scene !== firstMoveRace.afterR ||
    firstMoveRace.liveBeforeBaseline.moves !== 1 ||
    firstMoveRace.liveBeforeBaseline.phase !== "solving" ||
    firstMoveRace.liveAfterBaseline.predicted !== firstMoveRace.afterR ||
    firstMoveRace.liveAfterBaseline.scene !== firstMoveRace.afterR ||
    firstMoveRace.liveAfterBaseline.moves !== 1 ||
    firstMoveRace.recoveredBeforeBaseline.predicted !== firstMoveRace.base ||
    firstMoveRace.recoveredBeforeBaseline.scene !== firstMoveRace.base ||
    firstMoveRace.recoveredBeforeBaseline.moves !== 0 ||
    firstMoveRace.recoveredBeforeBaseline.phase !== "observing" ||
    firstMoveRace.recoveredAfterBaseline.predicted !== firstMoveRace.afterR ||
    firstMoveRace.recoveredAfterBaseline.scene !== firstMoveRace.afterR ||
    firstMoveRace.recoveredAfterBaseline.moves !== 0 ||
    firstMoveRace.recoveredAfterBaseline.phase !== "observing" ||
    firstMoveRace.faceletsFirst.predicted !== firstMoveRace.afterR ||
    firstMoveRace.faceletsFirst.scene !== firstMoveRace.afterR ||
    firstMoveRace.faceletsFirst.moves !== 1 ||
    firstMoveRace.faceletsFirst.phase !== "solving" ||
    firstMoveRace.nextLiveAfterBaseline.predicted !== firstMoveRace.afterRU ||
    firstMoveRace.nextLiveAfterBaseline.scene !== firstMoveRace.afterRU ||
    firstMoveRace.nextLiveAfterBaseline.moves !== 1 ||
    firstMoveRace.nextLiveAfterBaseline.phase !== "solving" ||
    firstMoveRace.recoveredDuringTraining.predicted !== firstMoveRace.base ||
    firstMoveRace.recoveredDuringTraining.scene !== firstMoveRace.base ||
    firstMoveRace.recoveredDuringTraining.moves !== 0 ||
    firstMoveRace.recoveredDuringTraining.phase !== "observing" ||
    firstMoveRace.multiMoveBeforeOldBaseline.predicted !== firstMoveRace.afterRU ||
    firstMoveRace.multiMoveBeforeOldBaseline.scene !== firstMoveRace.afterRU ||
    firstMoveRace.multiMoveBeforeOldBaseline.moves !== 2 ||
    firstMoveRace.multiMoveBeforeOldBaseline.eventSerial !== 172 ||
    firstMoveRace.serialWrap.predicted !== firstMoveRace.afterR ||
    firstMoveRace.serialWrap.scene !== firstMoveRace.afterR ||
    firstMoveRace.serialWrap.moves !== 1 ||
    firstMoveRace.serialWrap.eventSerial !== 0 ||
    firstMoveRace.duplicateMove.predicted !== firstMoveRace.afterR ||
    firstMoveRace.duplicateMove.scene !== firstMoveRace.afterR ||
    firstMoveRace.duplicateMove.moves !== 1 ||
    firstMoveRace.zeroSnapshotThenMove.predicted !== firstMoveRace.afterR ||
    firstMoveRace.zeroSnapshotThenMove.scene !== firstMoveRace.afterR ||
    firstMoveRace.zeroSnapshotThenMove.moves !== 1 ||
    firstMoveRace.zeroSnapshotThenMove.eventSerial !== 130 ||
    firstMoveRace.staleFacelets.predicted !== firstMoveRace.afterR ||
    firstMoveRace.staleFacelets.scene !== firstMoveRace.afterR ||
    firstMoveRace.staleFacelets.eventSerial !== 50
  ) {
    throw new Error(`BLE 轮次同步首步竞态未收敛: ${JSON.stringify(firstMoveRace)}`);
  }

  const reconnectBaseline = await page.evaluate(() => {
    const vm = window.__bleCross;
    const base = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    const afterR = "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB";
    vm.clearBleBaselineHeal();
    vm.autoNext = false;
    vm.isTrainDone = () => false;
    vm.isManual = false;
    vm.status = "connected";
    vm.phase = "solving";
    vm.predicted = base;
    vm.lastBleMoveAt = Date.now();
    vm.syncScene(base);

    vm.onLinkStatus("connecting");
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 41 });
    const beforeConnected = {
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
    };
    const newScramble = vm.newScramble.bind(vm);
    vm.newScramble = () => {};
    vm.onLinkStatus("connected");
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 41 });
    vm.world.cube.twister.finish();
    vm.newScramble = newScramble;
    return {
      afterR,
      beforeConnected,
      afterConnected: {
        predicted: vm.predicted,
        scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      },
    };
  });
  if (
    reconnectBaseline.beforeConnected.predicted !== reconnectBaseline.afterR ||
    reconnectBaseline.afterConnected.predicted !== reconnectBaseline.afterR ||
    reconnectBaseline.afterConnected.scene !== reconnectBaseline.afterR
  ) {
    throw new Error(`BLE 重连首包没有强制同步 3D: ${JSON.stringify(reconnectBaseline)}`);
  }

  const authoritativeViewHeal = await page.evaluate(() => {
    const vm = window.__bleCross;
    const base = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    const afterR = "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB";
    vm.clearBleBaselineHeal();
    vm.autoNext = false;
    vm.isTrainDone = () => false;
    vm.isManual = false;
    vm.status = "connected";
    vm.phase = "solving";
    vm.predicted = base;
    vm.solveBaseState = "";
    vm.baseOps = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.z2On = false;
    vm.syncScene(base);
    vm.rotateWholeY(1);
    vm.world.cube.twister.finish();
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    const before = {
      view: JSON.stringify(vm.effectiveViewOps()),
      shownR: vm.displayMove("R"),
    };
    vm.lastBleMoveAt = Date.now() - 3000;
    vm.onAuthoritative(afterR, 201, false);
    vm.world.cube.twister.finish();
    return {
      afterR,
      before,
      after: {
        view: JSON.stringify(vm.effectiveViewOps()),
        shownR: vm.displayMove("R"),
        scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      },
    };
  });
  if (
    authoritativeViewHeal.after.scene !== authoritativeViewHeal.afterR ||
    authoritativeViewHeal.after.view !== authoritativeViewHeal.before.view ||
    authoritativeViewHeal.after.shownR !== authoritativeViewHeal.before.shownR
  ) {
    throw new Error(`BLE 权威自愈丢失完整视角: ${JSON.stringify(authoritativeViewHeal)}`);
  }

  const bleRoundVisualReset = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const base = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    const afterR = "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB";
    const afterRU = "UUUUUUFFFUBBRRRRRRRRRFFDFFDDDBDDBDDBFFDLLLLLLLLLUBBUBB";
    const requestFacelets = vm.link.requestFacelets.bind(vm.link);
    const scrambler = vm.world.cube.twister.scrambler.bind(vm.world.cube.twister);
    vm.link.requestFacelets = async () => {};
    vm.autoNext = false;
    vm.isManual = false;
    vm.status = "connected";
    vm.phase = "observing";
    vm.predicted = base;
    vm.z2On = false;
    vm.baseOps = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.bleEventSerial = 70;
    vm.bleMoveSerial = 70;
    vm.bleAuthoritativeSerial = 70;
    vm.bleSessionBaselinePending = false;
    vm.syncScene(base);
    vm.rotateWholeY(1);
    vm.world.cube.twister.finish();
    const viewBeforeNew = JSON.stringify(vm.effectiveViewOps());

    vm.world.cube.twister.scrambler = () => "R";
    vm.newScramble();
    vm.world.cube.twister.finish();
    const afterNew = {
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      target: vm.scrambleTarget,
      history: vm.world.cube.history.moves,
      view: JSON.stringify(vm.effectiveViewOps()),
    };

    vm.bleRoundSyncPending = false;
    vm.handleEvent({ type: "move", move: "U", serial: 71, recovered: false });
    vm.world.cube.twister.finish();
    const afterBleMove = {
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      history: vm.world.cube.history.moves,
    };

    vm.resetRound();
    vm.world.cube.twister.finish();
    const afterReset = {
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      history: vm.world.cube.history.moves,
      moves: vm.moveCount,
      view: JSON.stringify(vm.effectiveViewOps()),
    };

    vm.rebasing = true;
    vm.syncScene(base);
    vm.world.cube.twister.setup("F");
    const afterF = vm.world.cube.serialize();
    vm.syncScene(base);
    vm.rebasing = false;
    vm.predicted = base;
    vm.phase = "success";
    vm.world.cube.twister.scrambler = () => "F";
    vm.nextRoundDirect();
    vm.world.cube.twister.finish();
    const afterAutoNext = {
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      target: vm.scrambleTarget,
      history: vm.world.cube.history.moves,
    };
    // 新轮 FACELETS 与实体账本存在漂移时，只能校正实体账本/事件序号；旧的延迟
    // baseline heal 不得在 160ms 后把虚拟打乱画面覆盖回实体状态。
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 80 });
    await new Promise(resolve => setTimeout(resolve, 220));
    vm.world.cube.twister.finish();
    const afterAuthoritative = {
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      predicted: vm.predicted,
    };

    vm.link.requestFacelets = requestFacelets;
    vm.world.cube.twister.scrambler = scrambler;
    return { afterR, afterRU, afterF, viewBeforeNew, afterNew, afterBleMove, afterReset, afterAutoNext, afterAuthoritative };
  });
  if (
    bleRoundVisualReset.afterNew.scene !== bleRoundVisualReset.afterR ||
    bleRoundVisualReset.afterNew.target !== bleRoundVisualReset.afterR ||
    bleRoundVisualReset.afterNew.history !== 0 ||
    bleRoundVisualReset.afterNew.view !== bleRoundVisualReset.viewBeforeNew ||
    bleRoundVisualReset.afterBleMove.scene !== bleRoundVisualReset.afterRU ||
    bleRoundVisualReset.afterBleMove.history !== 1 ||
    bleRoundVisualReset.afterReset.scene !== bleRoundVisualReset.afterR ||
    bleRoundVisualReset.afterReset.history !== 0 ||
    bleRoundVisualReset.afterReset.moves !== 0 ||
    bleRoundVisualReset.afterReset.view !== bleRoundVisualReset.viewBeforeNew ||
    bleRoundVisualReset.afterAutoNext.scene !== bleRoundVisualReset.afterF ||
    bleRoundVisualReset.afterAutoNext.target !== bleRoundVisualReset.afterF ||
    bleRoundVisualReset.afterAutoNext.history !== 0 ||
    bleRoundVisualReset.afterAuthoritative.scene !== bleRoundVisualReset.afterF ||
    bleRoundVisualReset.afterAuthoritative.predicted !== bleRoundVisualReset.afterR
  ) {
    throw new Error(`BLE 新打乱/重置没有与手动路径统一: ${JSON.stringify(bleRoundVisualReset)}`);
  }
}
