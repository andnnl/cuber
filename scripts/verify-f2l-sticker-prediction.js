async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  await page.addInitScript(() => {
    for (const key of ['trainerSolveMode', 'trainerSolveSlotMode', 'trainerDifficulty', 'trainerPredictCorner', 'trainerPredictEdge', 'trainerVisGhost', 'trainerVisHide', 'trainerAutoNext']) window.localStorage.removeItem(key);
  });
  const origin = page.url().startsWith('http') ? page.url().split('/').slice(0, 3).join('/') : 'http://127.0.0.1:18120';
  await page.goto(`${origin}/?mode=crossf2l&verify=${Date.now()}`);
  await page.waitForFunction(() => window.__crossF2L && !window.__crossF2L.solving && window.__crossF2L.solutions.length, null, { timeout: 120000 });
  await page.evaluate(() => window.__crossF2L.setCollapsed(false));
  const defaults = await page.evaluate(() => {
    const trainer = window.__crossF2L;
    return { corner: trainer.predictCorner, edge: trainer.predictEdge, options: Array.from(document.querySelector('[data-prediction-difficulty]').options).map(option => option.value), sticker: trainer.edgeSticker, choices: trainer.edgeStickerChoices };
  });
  expect(defaults.corner && defaults.edge, '默认必须同时预判角块和棱块');
  expect(defaults.options.join(',') === 'random,2,3,4,5,6,7', '难度必须与蓝牙十字一致');
  expect(defaults.choices.some(choice => choice.color === defaults.sticker), '应选中真实棱块色贴');

  const original = await page.evaluate(() => window.__crossF2L.world.cube.serialize());
  for (const [ghost, hide] of [[true, false], [true, true], [false, true], [true, true], [true, false], [false, false]]) {
    await page.locator('[data-prediction-ghost]').setChecked(ghost);
    await page.locator('[data-prediction-hide]').setChecked(hide);
    const visibility = await page.evaluate(() => {
      const trainer = window.__crossF2L;
      const target = trainer.world.cube.initials[trainer.mappedEdgeIndex];
      return { state: trainer.world.cube.serialize(), ghost: trainer.visGhost, hide: trainer.visHide, savedGhost: localStorage.getItem('trainerVisGhost'), savedHide: localStorage.getItem('trainerVisHide'), target: target.stickers.filter(Boolean).every(sticker => sticker.visible) };
    });
    expect(visibility.state === original && visibility.target, '显示选项不能改变逻辑状态或隐藏目标色贴');
    expect(visibility.ghost === ghost && visibility.hide === hide, '半透明和隐藏无关应支持独立开关、同时勾选');
    expect(visibility.savedGhost === (ghost ? '1' : '0') && visibility.savedHide === (hide ? '1' : '0'), '两个显示选项应独立保存');
  }

  await page.locator('[data-prediction-ghost]').check();
  await page.locator('[data-prediction-hide]').check();
  const restoredPage = await page.context().newPage();
  try {
    await restoredPage.goto(`${origin}/?mode=crossf2l`);
    await restoredPage.waitForFunction(() => window.__crossF2L);
    expect(await restoredPage.evaluate(() => window.__crossF2L.visGhost && window.__crossF2L.visHide), '重新打开页面应恢复同时勾选的显示设置');
  } finally {
    await restoredPage.close();
  }
  await page.locator('[data-prediction-ghost]').uncheck();
  await page.locator('[data-prediction-hide]').uncheck();

  const actual = await page.evaluate(async () => {
    const trainer = window.__crossF2L;
    trainer.play();
    trainer.world.cube.twister.finish();
    const corner = trainer.world.cube.initials[trainer.mappedCornerIndex];
    const edge = trainer.world.cube.initials[trainer.mappedEdgeIndex];
    const answer = { corner: corner.index, edge: edge.index, cornerFace: trainer.stickerFace(corner, trainer.cornerSticker), edgeFace: trainer.stickerFace(edge, trainer.edgeSticker) };
    trainer.reset();
    await trainer.$nextTick();
    return answer;
  });
  await page.getByLabel('角块预测位置', { exact: true }).selectOption(String(actual.corner));
  await page.getByLabel('角块底色预测朝向', { exact: true }).selectOption(actual.cornerFace);
  await page.getByLabel('棱块预测位置', { exact: true }).selectOption(String(actual.edge));
  await page.getByLabel('棱块指定色预测朝向', { exact: true }).selectOption(actual.edgeFace);
  const correct = await page.evaluate(() => {
    const trainer = window.__crossF2L;
    trainer.play(); trainer.world.cube.twister.finish();
    return trainer.result;
  });
  expect(correct.includes('预判正确'), `位置和朝向都正确应通过：${correct}`);
  await page.evaluate(() => {
    const trainer = window.__crossF2L;
    trainer.stepBack(); trainer.world.cube.twister.finish();
    trainer.stepForward(); trainer.world.cube.twister.finish();
  });
  expect(await page.evaluate(() => window.__crossF2L.result.includes('预判正确')), '回退重播不应改变色贴答案');
  const wrong = await page.evaluate(answer => {
    const trainer = window.__crossF2L;
    trainer.reset();
    trainer.predictedCornerIndex = answer.corner;
    trainer.predictedCornerFace = trainer.predictionFaces('corner').find(face => face !== answer.cornerFace);
    trainer.predictedEdgeIndex = answer.edge; trainer.predictedEdgeFace = answer.edgeFace;
    trainer.play(); trainer.world.cube.twister.finish();
    return trainer.result;
  }, actual);
  expect(wrong.includes('预判错误') && wrong.includes('位置✓、朝向✗'), `不能只判位置：${wrong}`);

  await page.evaluate(() => window.__crossF2L.reset());
  await page.locator('[data-predict-corner]').uncheck();
  const edgeOnly = await page.evaluate(answer => {
    const trainer = window.__crossF2L;
    trainer.predictedEdgeIndex = answer.edge; trainer.predictedEdgeFace = answer.edgeFace;
    trainer.play(); trainer.world.cube.twister.finish();
    return trainer.result;
  }, actual);
  expect(edgeOnly.includes('预判正确'), `未选角块不应参与判定：${edgeOnly}`);
  await page.locator('[data-predict-corner]').check();
  await page.locator('[data-predict-edge]').uncheck();
  const cornerOnly = await page.evaluate(answer => {
    const trainer = window.__crossF2L;
    trainer.predictedCornerIndex = answer.corner; trainer.predictedCornerFace = answer.cornerFace;
    trainer.play(); trainer.world.cube.twister.finish();
    return trainer.result;
  }, actual);
  expect(cornerOnly.includes('预判正确'), `未选棱块不应参与判定：${cornerOnly}`);
  await page.locator('[data-predict-edge]').check();
  const changedSticker = await page.evaluate(() => {
    const trainer = window.__crossF2L;
    trainer.edgeSticker = trainer.edgeStickerChoices.find(choice => choice.color !== trainer.edgeSticker).color;
    trainer.predictedCornerIndex = 26; trainer.predictedCornerFace = 'U';
    trainer.changeEdgeSticker();
    const chosen = trainer.edgeSticker;
    const cleared = trainer.predictedCornerIndex === null && trainer.predictedEdgeIndex === null;
    trainer.play(); trainer.world.cube.twister.finish();
    const stable = trainer.edgeSticker === chosen;
    trainer.reset();
    return cleared && stable && trainer.edgeSticker === chosen;
  });
  expect(changedSticker, '换追踪色应清空旧预判，播放、重置不能自动换色');

  const clicks = await page.evaluate(() => {
    const trainer = window.__crossF2L;
    trainer.clearPrediction();
    trainer.onTap(26, 3);
    const first = [trainer.predictedCornerIndex, trainer.predictedCornerFace];
    trainer.onTap(26, 5);
    const second = [trainer.predictedCornerIndex, trainer.predictedCornerFace];
    trainer.onTap(26, 5);
    const removed = trainer.predictedCornerIndex === null;
    trainer.restoreView(true);
    trainer.world.cube.twister.push('y'); trainer.world.cube.twister.finish();
    trainer.onWholeTurn('y', 1);
    trainer.onTap(26, 5);
    const dragged = [trainer.predictedCornerIndex, trainer.predictedCornerFace];
    trainer.restoreView(true);
    return { first, second, removed, dragged, pending: trainer.pendingRestore.length };
  });
  expect(clicks.first.join(',') === '26,U' && clicks.second.join(',') === '26,F' && clicks.removed, '点击必须精确区分同位置的不同面');
  expect(clicks.dragged.join(',') !== '26,F' && clicks.pending === 0, '临时观察应同时逆变换位置和面');

  const custom = await page.evaluate(async () => {
    const trainer = window.__crossF2L;
    trainer.reset();
    trainer.customSolution = trainer.solutions[trainer.selectedSolution];
    const chosen = trainer.customSolution;
    trainer.applyCustomSolution();
    const active = trainer.customSolutionActive && trainer.currentSolutionSteps.join(' ') === chosen;
    const cleared = trainer.predictedCornerIndex === null && trainer.predictedEdgeIndex === null;
    trainer.stepForward(); trainer.world.cube.twister.finish();
    trainer.stepBack(); trainer.world.cube.twister.finish();
    trainer.reset();
    const retained = trainer.customSolutionActive;
    trainer.selectSolution(0);
    return { active, cleared, retained, inactive: !trainer.customSolutionActive, messageCleared: !trainer.result };
  });
  expect(custom.active && custom.cleared && custom.retained && custom.inactive && custom.messageCleared, `自定义解法切换、重置或回退异常：${JSON.stringify(custom)}`);
  const independentCustom = await page.evaluate(() => {
    const trainer = window.__crossF2L;
    const solutions = trainer.solutions.slice();
    const slots = trainer.solutionSlots.slice();
    const recommendations = trainer.solutionRecommendationIds.slice();
    trainer.solutions = []; trainer.selectedSolution = -1;
    trainer.customSolution = "R U R'";
    trainer.applyCustomSolution();
    trainer.onTap(26, 3);
    const independent = !trainer.solving && trainer.canPlay && trainer.predictedCornerFace === 'U';
    trainer.solveRequestId++; trainer.solving = false;
    trainer.solutions = solutions; trainer.solutionSlots = slots; trainer.solutionRecommendationIds = recommendations;
    trainer.customSolutionActive = false; trainer.selectedSolution = 0; trainer.reset();
    return independent;
  });
  expect(independentCustom, '没有自动解法时仍应能使用自定义解法和点击作答');
  const modeChange = await page.evaluate(async () => {
    const trainer = window.__crossF2L;
    trainer.customSolution = trainer.solutions[0]; trainer.applyCustomSolution();
    trainer.solveMode = 'xcross';
    await trainer.$nextTick();
    return !trainer.customSolutionActive;
  });
  expect(modeChange, '切换求解目标必须退出旧的自定义解法并重算');
  await page.waitForFunction(() => !window.__crossF2L.solving, null, { timeout: 120000 });
  await page.evaluate(() => { window.__crossF2L.solveMode = 'cross'; });
  await page.waitForFunction(() => !window.__crossF2L.solving && window.__crossF2L.solveMode === 'cross' && window.__crossF2L.solutions.length, null, { timeout: 120000 });

  const difficulties = [];
  for (const [steps, rotate] of [[2, false], [3, true], [7, false]]) {
    if (rotate) {
      await page.evaluate(() => { const trainer = window.__crossF2L; trainer.rotateZ2(); trainer.world.cube.twister.finish(); });
      await page.waitForFunction(() => !window.__crossF2L.solving && !window.__crossF2L.pendingSolve, null, { timeout: 60000 });
      await page.evaluate(() => { const trainer = window.__crossF2L; trainer.rotateY(1); trainer.world.cube.twister.finish(); });
      await page.waitForFunction(() => !window.__crossF2L.solving && !window.__crossF2L.pendingSolve, null, { timeout: 60000 });
    }
    await page.locator('[data-prediction-difficulty]').selectOption(String(steps));
    await page.evaluate(() => window.__crossF2L.rescramble());
    await page.waitForFunction(() => !window.__crossF2L.generatingDifficulty && !window.__crossF2L.solving && window.__crossF2L.solutions.length, null, { timeout: 120000 });
    const shortest = await page.evaluate(() => Math.min(...window.__crossF2L.solutions.map(formula => formula.trim().split(/\s+/).filter(Boolean).length)));
    expect(shortest === steps, `难度 ${steps} 步实际最优为 ${shortest}`);
    difficulties.push(shortest);
  }
  const cancelled = await page.evaluate(async () => {
    const trainer = window.__crossF2L;
    const originalSolve = trainer.solver.solveCross;
    let release;
    trainer.solver.solveCross = () => new Promise(resolve => { release = resolve; });
    const before = trainer.scramble;
    const pending = trainer.rescramble();
    trainer.difficulty = 'random'; trainer.saveDifficulty();
    release(['R']);
    await pending;
    trainer.solver.solveCross = originalSolve;
    return !trainer.generatingDifficulty && trainer.scramble === before;
  });
  expect(cancelled, '取消生成后不应覆盖当前题目');

  for (const [width, height] of [[390, 844], [844, 390], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => {
      const panel = document.querySelector('.trainer-overlay-card');
      const text = panel.querySelector('.v-card__text');
      const canvas = document.querySelector('canvas');
      return { right: panel.getBoundingClientRect().right, bottom: panel.getBoundingClientRect().bottom, scroll: getComputedStyle(text).overflowY, canvasBottom: canvas.getBoundingClientRect().bottom, panelTop: panel.getBoundingClientRect().top, doc: document.documentElement.scrollWidth };
    });
    expect(layout.right <= width + 1 && layout.bottom <= height + 1 && layout.doc <= width + 1 && layout.scroll === 'auto', `面板滚动或边界异常 ${width}：${JSON.stringify(layout)}`);
    expect(layout.canvasBottom <= layout.panelTop + 2, `魔方不应被面板遮挡 ${width}：${JSON.stringify(layout)}`);
  }
  expect(errors.length === 0, `页面异常：${errors.join('; ')}`);
  return { defaults, correct, wrong, edgeOnly, cornerOnly, changedSticker, clicks, custom, independentCustom, difficulties, cancelled, errors };
}
