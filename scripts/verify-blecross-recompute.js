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
    vm.phase = "solving";
    vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    vm.solveBaseState = "";
    vm.needBreak = true;
    vm.userMoves = [];
    vm.userDisplayMoves = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.z2On = false;
    vm.__mirrored = [];
    vm.mirrorPush = move => vm.__mirrored.push(move);

    vm.onMoveEvent("D");
    const beforeZ2 = vm.liveStepsText;
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    const afterZ2 = vm.liveStepsText;
    vm.onMoveEvent("D");
    return {
      beforeZ2,
      afterZ2,
      afterSecond: vm.liveStepsText,
      mirrored: vm.__mirrored.slice(),
    };
  });
  if (
    liveFrame.beforeZ2 !== "D" ||
    liveFrame.afterZ2 !== "D" ||
    liveFrame.afterSecond !== "D U" ||
    JSON.stringify(liveFrame.mirrored) !== JSON.stringify(["D", "U"])
  ) {
    throw new Error(`蓝牙步骤没有固定事件时视角: ${JSON.stringify(liveFrame)}`);
  }

  const segmented = await page.evaluate(() => {
    const vm = window.__bleCross;
    const reset = () => {
      vm.userMoves = [];
      vm.userDisplayMoves = [];
      vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
      vm.phase = "solving";
      vm.needBreak = true;
      vm.observedOps = [];
      vm.z2Marks = [];
      vm.z2On = false;
    };
    reset();
    vm.onMoveEvent("D");
    vm.onMoveEvent("D");
    const sameView = vm.liveStepsText;
    reset();
    vm.onMoveEvent("D");
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    vm.onMoveEvent("D");
    return { sameView, splitView: vm.liveStepsText };
  });
  if (segmented.sameView !== "D2" || segmented.splitView !== "D U") {
    throw new Error(`蓝牙显示步骤分段化简错误: ${JSON.stringify(segmented)}`);
  }

  const mixedView = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.userMoves = [];
    vm.userDisplayMoves = [];
    vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    vm.phase = "solving";
    vm.needBreak = true;
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.z2On = false;
    vm.onMoveEvent("R");
    vm.rotateWholeY(1);
    vm.world.cube.twister.finish();
    const secondExpected = vm.displayMove("F");
    vm.onMoveEvent("F");
    const live = vm.liveStepsText;
    vm.rotateWholeY(-1);
    vm.world.cube.twister.finish();
    const afterYBack = vm.liveStepsText;
    vm.userSolution = vm.userMoves.join(" ");
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
        displayMoves: vm.userDisplayMoves.length,
        scene: vm.mapStateForJudge(vm.world.cube.serialize()),
        authoritative: vm.predicted,
      };
    });
    if (resetStep.moves !== 1 || resetStep.displayMoves !== 1 || resetStep.scene !== resetStep.authoritative) {
      throw new Error(`第 ${round + 1} 次重置后的首转被重复消费: ${JSON.stringify(resetStep)}`);
    }
  }

  const reordered = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const base = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    const afterR = "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB";
    vm.autoNext = false;
    vm.z2On = false;
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.isManual = false;
    vm.status = "connected";
    vm.phase = "observing";
    vm.predicted = base;
    vm.userMoves = [];
    vm.userDisplayMoves = [];
    vm.moveCount = 0;
    vm.previewPending = true;
    vm.syncScene(base);

    // 真机可能先上报已包含本步的权威状态，再上报同序号 MOVE。
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 41 });
    vm.handleEvent({ type: "move", move: "R", serial: 41 });
    vm.world.cube.twister.finish();
    const sameSerial = {
      predicted: vm.predicted,
      scene: vm.world.cube.serialize(),
      moves: vm.moveCount,
      displayMoves: vm.userDisplayMoves.length,
      previewPending: vm.previewPending,
    };

    // 已消费 serial=41 后迟到的 serial=40 不得把状态回拉。
    vm.handleEvent({ type: "facelets", facelets: base, serial: 40 });
    vm.world.cube.twister.finish();
    const afterStale = { predicted: vm.predicted, scene: vm.world.cube.serialize() };

    // 8 位序号 255→0 是向前一步，不得误判为旧事件。
    vm.bleEventSerial = null;
    vm.bleMoveSerial = null;
    vm.bleAuthoritativeSerial = null;
    vm.bleAuthoritativePhase = null;
    vm.phase = "observing";
    vm.predicted = base;
    vm.userMoves = [];
    vm.userDisplayMoves = [];
    vm.moveCount = 0;
    vm.previewPending = false;
    vm.syncScene(base);
    vm.handleEvent({ type: "facelets", facelets: base, serial: 255 });
    vm.handleEvent({ type: "move", move: "R", serial: 0 });
    vm.world.cube.twister.finish();
    const wrapped = {
      predicted: vm.predicted,
      scene: vm.world.cube.serialize(),
      moves: vm.moveCount,
      displayMoves: vm.userDisplayMoves.length,
    };

    // 真机两个通知可能跨浏览器任务到达；判定回调跑过后，同序号 MOVE 仍须对账而非丢弃。
    vm.bleEventSerial = null;
    vm.bleMoveSerial = null;
    vm.bleAuthoritativeSerial = null;
    vm.bleAuthoritativePhase = null;
    vm.bleAuthoritativePending = false;
    vm.phase = "observing";
    vm.predicted = base;
    vm.userMoves = [];
    vm.userDisplayMoves = [];
    vm.moveCount = 0;
    vm.previewPending = true;
    vm.syncScene(base);
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 73 });
    await new Promise(resolve => setTimeout(resolve, 10));
    vm.handleEvent({ type: "move", move: "R", serial: 73 });
    vm.world.cube.twister.finish();
    const delayed = {
      predicted: vm.predicted,
      scene: vm.world.cube.serialize(),
      moves: vm.moveCount,
      displayMoves: vm.userDisplayMoves.length,
      previewPending: vm.previewPending,
    };

    // 权威状态先命中打乱终点时，同序号 MOVE 仍属于打乱阶段，不能计入还原步骤。
    vm.bleEventSerial = null;
    vm.bleMoveSerial = null;
    vm.bleAuthoritativeSerial = null;
    vm.bleAuthoritativePhase = null;
    vm.bleAuthoritativePending = false;
    vm.phase = "scrambling";
    vm.scrambleTarget = afterR;
    vm.scramblePath = [base, afterR];
    vm.predicted = base;
    vm.userMoves = [];
    vm.userDisplayMoves = [];
    vm.moveCount = 0;
    vm.previewPending = true;
    vm.syncScene(base);
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 91 });
    await new Promise(resolve => setTimeout(resolve, 10));
    vm.handleEvent({ type: "move", move: "R", serial: 91 });
    vm.world.cube.twister.finish();
    const scrambleFinish = {
      phase: vm.phase,
      predicted: vm.predicted,
      scene: vm.world.cube.serialize(),
      moves: vm.moveCount,
      displayMoves: vm.userDisplayMoves.length,
    };
    return { base, afterR, sameSerial, afterStale, wrapped, delayed, scrambleFinish };
  });
  if (
    reordered.sameSerial.predicted !== reordered.afterR ||
    reordered.sameSerial.scene !== reordered.afterR ||
    reordered.sameSerial.moves !== 1 ||
    reordered.sameSerial.displayMoves !== 1 ||
    reordered.sameSerial.previewPending ||
    reordered.afterStale.predicted !== reordered.afterR ||
    reordered.afterStale.scene !== reordered.afterR ||
    reordered.wrapped.predicted !== reordered.afterR ||
    reordered.wrapped.scene !== reordered.afterR ||
    reordered.wrapped.moves !== 1 ||
    reordered.wrapped.displayMoves !== 1 ||
    reordered.delayed.predicted !== reordered.afterR ||
    reordered.delayed.scene !== reordered.afterR ||
    reordered.delayed.moves !== 1 ||
    reordered.delayed.displayMoves !== 1 ||
    reordered.delayed.previewPending ||
    reordered.scrambleFinish.phase !== "solving" ||
    reordered.scrambleFinish.predicted !== reordered.afterR ||
    reordered.scrambleFinish.scene !== reordered.afterR ||
    reordered.scrambleFinish.moves !== 0 ||
    reordered.scrambleFinish.displayMoves !== 0
  ) {
    throw new Error(`BLE 乱序/旧帧/序号回绕对账失败: ${JSON.stringify(reordered)}`);
  }

  const roundBoundary = await page.evaluate(() => {
    const vm = window.__bleCross;
    const base = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    const afterR = "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB";
    const afterRUF = "UUUUUULLDFBBFRRFRRFFRFFRDDRRRUDDBDDBFFDLLDLLBLLLUBBUBB";
    const actualFirst = "BUUBUULLDFBBFRRFRRUFRUFRLDRFRUFDBDDBLLFLLFBDDLLDUBDUBR";
    vm.autoNext = false;
    vm.z2On = false;
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.isManual = false;
    vm.status = "connected";
    vm.phase = "solving";
    vm.solveBaseState = base;
    vm.solveBaseScreenFrame = false;
    vm.predicted = afterR;
    vm.userMoves = ["R"];
    vm.userDisplayMoves = [{ physical: "R", display: "R", viewSig: "[]" }];
    vm.moveCount = 1;
    vm.bleEventSerial = 100;
    vm.bleMoveSerial = 100;
    vm.bleAuthoritativeSerial = 100;
    vm.syncScene(afterR);

    vm.resetRound();
    const preview = vm.world.cube.serialize();

    // 真机在重置边界可能随下一通知补发按钮点击前的历史 MOVE；基线 FACELETS
    // 到达前不得把这些动作当成新一轮首步播放或计数。
    vm.handleEvent({ type: "move", move: "U", serial: 101 });
    vm.handleEvent({ type: "move", move: "F", serial: 102 });
    vm.world.cube.twister.finish();
    const beforeBaseline = {
      scene: vm.world.cube.serialize(),
      moves: vm.moveCount,
      displayMoves: vm.userDisplayMoves.length,
      phase: vm.phase,
    };

    // 权威帧确认按钮点击时的实体基线（已包含补发历史）。Gen2/Gen3/Gen4 协议层
    // 仍可能在下一通知里把基线前的 MOVE 再补发一次，序号不超过基线的都须丢弃。
    vm.handleEvent({ type: "facelets", facelets: afterRUF, serial: 102 });
    const baseline = {
      predicted: vm.predicted,
      scene: vm.world.cube.serialize(),
      moves: vm.moveCount,
      phase: vm.phase,
    };
    vm.handleEvent({ type: "move", move: "U", serial: 101 });
    vm.handleEvent({ type: "move", move: "F", serial: 102 });
    vm.handleEvent({ type: "move", move: "L", serial: 103 });
    vm.handleEvent({ type: "facelets", facelets: actualFirst, serial: 103 });
    vm.world.cube.twister.finish();
    return {
      base,
      preview,
      beforeBaseline,
      baseline,
      predicted: vm.predicted,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      actualFirst,
      moves: vm.moveCount,
      displayMoves: vm.userDisplayMoves.length,
      phase: vm.phase,
    };
  });
  if (
    roundBoundary.preview !== roundBoundary.base ||
    roundBoundary.beforeBaseline.scene !== roundBoundary.preview ||
    roundBoundary.beforeBaseline.moves !== 0 ||
    roundBoundary.beforeBaseline.displayMoves !== 0 ||
    roundBoundary.beforeBaseline.phase !== "observing" ||
    roundBoundary.baseline.predicted !== "UUUUUULLDFBBFRRFRRFFRFFRDDRRRUDDBDDBFFDLLDLLBLLLUBBUBB" ||
    roundBoundary.baseline.scene !== roundBoundary.preview ||
    roundBoundary.baseline.moves !== 0 ||
    roundBoundary.baseline.phase !== "observing" ||
    roundBoundary.predicted !== roundBoundary.actualFirst ||
    roundBoundary.scene !== roundBoundary.actualFirst ||
    roundBoundary.moves !== 1 ||
    roundBoundary.displayMoves !== 1 ||
    roundBoundary.phase !== "solving"
  ) {
    throw new Error(`BLE 重置边界的补发历史污染新一轮: ${JSON.stringify(roundBoundary)}`);
  }

  const scrambleBoundary = await page.evaluate(() => {
    const vm = window.__bleCross;
    const base = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    const afterR = "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB";
    vm.autoNext = false;
    vm.showBest = false;
    vm.z2On = false;
    vm.isManual = false;
    vm.status = "connected";
    vm.phase = "observing";
    vm.predicted = base;
    vm.bleEventSerial = 120;
    vm.bleMoveSerial = 120;
    vm.bleAuthoritativeSerial = 120;
    vm.newScramble();
    vm.handleEvent({ type: "move", move: "R", serial: 121 });
    vm.handleEvent({ type: "facelets", facelets: afterR, serial: 121 });
    vm.world.cube.twister.finish();
    return {
      predicted: vm.predicted,
      pathBase: vm.scramblePath[0],
      pathTarget: vm.scramblePath[vm.scramblePath.length - 1],
      target: vm.scrambleTarget,
      scene: vm.mapStateForJudge(vm.world.cube.serialize()),
      moves: vm.moveCount,
      phase: vm.phase,
    };
  });
  if (
    scrambleBoundary.predicted !== scrambleBoundary.pathBase ||
    scrambleBoundary.pathTarget !== scrambleBoundary.target ||
    scrambleBoundary.scene !== scrambleBoundary.target ||
    scrambleBoundary.moves !== 0 ||
    scrambleBoundary.phase !== "scrambling"
  ) {
    throw new Error(`BLE 新打乱边界没有按权威基线重建: ${JSON.stringify(scrambleBoundary)}`);
  }
}
