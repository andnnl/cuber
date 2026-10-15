async page => {
  const url = page.url().includes('mode=blecross') ? page.url() : 'http://127.0.0.1:18083/?mode=blecross';
  await page.goto(`${url.split('&previewTest=')[0]}&previewTest=${Date.now()}`);
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.getByText('新打乱').first().click();
  await page.waitForFunction(() => window.__bleCross.phase === 'observing');
  if (!await page.evaluate(() => window.__bleCross.recommendationOpen)) {
    await page.locator('[data-ble-recommend-open]').click();
  }
  await page.waitForFunction(() => window.__bleCross.recommendations.length || window.__bleCross.recommendationError, null, { timeout: 180000 });
  const selected = await page.evaluate(() => {
    const vm = window.__bleCross;
    if (vm.recommendationError) throw new Error(vm.recommendationError);
    vm.recommendationAll = true;
    const index = vm.visibleRecommendations.findIndex(item => item.front !== 'F' && item.physicalMoves.length > 0);
    if (index < 0) throw new Error('缺少侧面指法推荐');
    const item = vm.visibleRecommendations[index];
    return { index, id: item.id, formula: item.physicalMoves.join(' '),
      center: vm.world.cube.serialize()['URFDLB'.indexOf(item.front) * 9 + 4],
      originalFront: vm.world.cube.serialize()[22] };
  });
  const card = page.locator('.ble-recommendation-panel .ble-recommendation-item').nth(selected.index);
  await card.click();
  const collision = await page.evaluate(({ formula, id }) => {
    const vm = window.__bleCross;
    const item = vm.selectedRecommendation;
    vm.playBest(formula); // 同一文本作为普通公式时，不应采用所选推荐的正面
    const normalFront = vm.world.cube.serialize()[22];
    vm.cancelBestPlay();
    vm.stepBest(formula, 1, item);
    return { normalFront, normalPos: vm.bestStepAt(formula),
      recommendationPos: vm.bestStepAt(formula, item), id };
  }, selected);
  if (collision.normalFront !== selected.originalFront || collision.normalPos !== 0 || collision.recommendationPos !== 1) {
    throw new Error(`普通公式与推荐公式撞名时发生串用：${JSON.stringify({ selected, collision })}`);
  }
  await page.waitForFunction(() => !window.__bleCross.playingBest);
  const duplicate = await page.evaluate(id => {
    const vm = window.__bleCross;
    const original = vm.recommendations.find(item => item.id === id);
    const other = { ...original, id: `${id}:same-formula`, front: original.front === 'L' ? 'R' : 'L' };
    vm.recommendations.push(other);
    vm.selectRecommendation(other);
    const before = vm.bestStepAt(other.physicalMoves.join(' '), other);
    vm.stepBest(other.physicalMoves.join(' '), 1, other);
    return { before, first: vm.bestStepAt(original.physicalMoves.join(' '), original),
      second: vm.bestStepAt(other.physicalMoves.join(' '), other) };
  }, selected.id);
  if (duplicate.before !== 0 || duplicate.first !== 1 || duplicate.second !== 1) {
    throw new Error(`共用公式的推荐卡片游标串用：${JSON.stringify(duplicate)}`);
  }
  await page.waitForFunction(() => !window.__bleCross.playingBest);
  await page.evaluate(id => {
    const vm = window.__bleCross;
    vm.selectRecommendation(vm.recommendations.find(item => item.id === id));
  }, selected.id);
  const trainingBefore = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { phase: vm.phase, moveCount: vm.moveCount, records: vm.records.length, predicted: vm.predicted };
  });

  const immediately = await page.evaluate(formula => {
    const vm = window.__bleCross;
    vm.__previewStartedAt = performance.now();
    const item = vm.selectedRecommendation;
    vm.playBest(formula, item);
    return { center: vm.world.cube.serialize()[22], pos: vm.bestStepAt(formula, item), playing: vm.playingBest };
  }, selected.formula);
  if (immediately.center !== selected.center || immediately.pos !== 0 || !immediately.playing) {
    throw new Error(`播放没有先转正并停在第零步：${JSON.stringify({ selected, immediately })}`);
  }
  await page.waitForTimeout(700);
  if (await page.evaluate(() => window.__bleCross.bestStepAt(window.__bleCross.selectedRecommendation.physicalMoves.join(' '), window.__bleCross.selectedRecommendation)) !== 0) {
    throw new Error('播放转正后未停满 1 秒便开始第一步');
  }
  await page.waitForFunction(() => window.__bleCross.bestStepAt(window.__bleCross.selectedRecommendation.physicalMoves.join(' '), window.__bleCross.selectedRecommendation) > 0, null, { timeout: 5000 });
  const playDelay = await page.evaluate(() => performance.now() - window.__bleCross.__previewStartedAt);
  if (playDelay < 950) throw new Error(`播放转正停顿不足：${playDelay}ms`);
  await page.waitForFunction(() => !window.__bleCross.playingBest, null, { timeout: 30000 });

  const download = page.waitForEvent('download', { timeout: 60000 });
  const gifInitial = await page.evaluate(({ id, formula }) => {
    const vm = window.__bleCross;
    const item = vm.visibleRecommendations.find(entry => entry.id === id);
    vm.toggleRecommendationGif(item);
    return { center: vm.world.cube.serialize()[22], pos: vm.bestStepAt(formula, item), frames: vm.gifFrames,
      recording: vm.gifRecording, auto: vm.gifAuto };
  }, selected);
  if (gifInitial.center !== selected.center || gifInitial.pos !== 0 || gifInitial.frames < 1 ||
      !gifInitial.recording || !gifInitial.auto) {
    throw new Error(`GIF 未从转正的静止帧开始：${JSON.stringify(gifInitial)}`);
  }
  await page.waitForTimeout(700);
  if (await page.evaluate(() => window.__bleCross.bestStepAt(window.__bleCross.selectedRecommendation.physicalMoves.join(' '), window.__bleCross.selectedRecommendation)) !== 0) {
    throw new Error('GIF 未录满 1 秒正面静止画面便开始第一步');
  }
  await page.waitForFunction(() => window.__bleCross.bestStepAt(window.__bleCross.selectedRecommendation.physicalMoves.join(' '), window.__bleCross.selectedRecommendation) > 0, null, { timeout: 5000 });
  const gifFramesBeforeFirstMove = await page.evaluate(() => window.__bleCross.gifFrames);
  if (gifFramesBeforeFirstMove < 12) {
    throw new Error(`GIF 静止段帧数不足：${gifFramesBeforeFirstMove}`);
  }
  const file = await download;
  if (!file.suggestedFilename().endsWith('.gif')) throw new Error(`GIF 导出文件异常：${file.suggestedFilename()}`);
  const trainingAfter = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { phase: vm.phase, moveCount: vm.moveCount, records: vm.records.length, predicted: vm.predicted };
  });
  for (const key of Object.keys(trainingBefore)) {
    if (trainingAfter[key] !== trainingBefore[key]) throw new Error(`预览改动训练数据 ${key}`);
  }
  await card.click();
  await card.locator('[data-ble-recommend-preview]').getByTitle('GIF').click();
  await page.waitForFunction(() => window.__bleCross.gifRecording && window.__bleCross.playingBest);
  await card.locator('[data-ble-recommend-preview]').getByTitle('GIF').click();
  await page.waitForTimeout(1100);
  const stopped = await page.evaluate(() => ({ recording: window.__bleCross.gifRecording,
    playing: window.__bleCross.playingBest, pos: window.__bleCross.bestStepAt(window.__bleCross.selectedRecommendation.physicalMoves.join(' '), window.__bleCross.selectedRecommendation) }));
  if (stopped.recording || stopped.playing || stopped.pos !== 0) {
    throw new Error(`手动停止 GIF 后仍继续播放：${JSON.stringify(stopped)}`);
  }
  const switched = await page.evaluate(id => {
    const vm = window.__bleCross;
    const current = vm.visibleRecommendations.find(item => item.id === id);
    const next = vm.visibleRecommendations.find(item => item.id !== id);
    if (!next) throw new Error('缺少另一条可切换的推荐');
    vm.selectRecommendation(current);
    vm.toggleRecommendationGif(current);
    vm.selectRecommendation(next);
    return { recording: vm.gifRecording, playing: vm.playingBest };
  }, selected.id);
  await page.waitForTimeout(1100);
  if (switched.recording || switched.playing ||
      await page.evaluate(id => {
        const item = window.__bleCross.recommendations.find(entry => entry.id === id);
        return window.__bleCross.bestStepAt(item.physicalMoves.join(' '), item);
      }, selected.id) !== 0) {
    throw new Error(`切换推荐后旧 GIF 继续播放：${JSON.stringify(switched)}`);
  }
  await page.evaluate(() => { window.__bleCross.recommendationOpen = false; });
  await page.getByText('新打乱').first().click();
  await page.waitForFunction(() => window.__bleCross.phase === 'observing' && !!window.__bleCross.gifPlayTarget(), null, { timeout: 30000 });
  const generalDownload = page.waitForEvent('download', { timeout: 60000 });
  const general = await page.evaluate(() => {
    const vm = window.__bleCross;
    const formula = vm.gifPlayTarget();
    vm.__generalGifStartedAt = performance.now();
    vm.toggleGif();
    return { formula, manual: vm.isManual, recording: vm.gifRecording, playing: vm.playingBest,
      pos: vm.bestStepAt(formula), frames: vm.gifFrames };
  });
  if (!general.manual || !general.recording || !general.playing || general.pos !== 0 || general.frames < 1) {
    throw new Error(`普通 GIF 没有从已转正的第零步开始：${JSON.stringify(general)}`);
  }
  await page.waitForFunction(formula => window.__bleCross.bestStepAt(formula) > 0, general.formula, { timeout: 5000 });
  const generalDelay = await page.evaluate(() => performance.now() - window.__bleCross.__generalGifStartedAt);
  if (generalDelay < 950 || generalDelay > 1500) {
    throw new Error(`普通 GIF 起播停顿不是 1 秒：${generalDelay}ms`);
  }
  await generalDownload;
  await page.waitForFunction(() => !window.__bleCross.gifRecording && !!window.__bleCross.gifPlayTarget());
  const cancelled = await page.evaluate(() => {
    const vm = window.__bleCross;
    const formula = vm.gifPlayTarget();
    vm.toggleGif();
    vm.toggleGif();
    return { formula, recording: vm.gifRecording, playing: vm.playingBest, pos: vm.bestStepAt(formula) };
  });
  await page.waitForTimeout(1100);
  if (cancelled.recording || cancelled.playing ||
      await page.evaluate(formula => window.__bleCross.bestStepAt(formula), cancelled.formula) !== 0) {
    throw new Error(`普通 GIF 提前停止后仍执行首步：${JSON.stringify(cancelled)}`);
  }
  const changedView = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.playBest(vm.gifPlayTarget());
    vm.rotateWholeY(1);
    return { playing: vm.playingBest, queued: vm.bestPlayQueue.length };
  });
  await page.waitForTimeout(1100);
  if (changedView.playing || changedView.queued || await page.evaluate(() => window.__bleCross.playingBest)) {
    throw new Error(`切换 y 视角仍执行旧预览：${JSON.stringify(changedView)}`);
  }
  const changedMode = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.playBest(vm.gifPlayTarget());
    vm.recomputeBestForTargetChange();
    return { playing: vm.playingBest, queued: vm.bestPlayQueue.length };
  });
  if (changedMode.playing || changedMode.queued) throw new Error(`重算训练目标未取消旧预览：${JSON.stringify(changedMode)}`);
  const autoNext = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.resultTimer = 123456;
    vm.toggleGif();
    const result = { recording: vm.gifRecording, playing: vm.playingBest };
    vm.resultTimer = null;
    return result;
  });
  if (autoNext.recording || autoNext.playing) throw new Error(`自动下轮倒计时启动旧轮 GIF：${JSON.stringify(autoNext)}`);
  return { playDelay, gifFramesBeforeFirstMove, download: file.suggestedFilename(), generalDelay, trainingAfter };
}
