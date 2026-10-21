async page => {
  const origin = 'http://127.0.0.1:18083/';
  const crossIndices = [28, 25, 32, 16, 34, 52, 30, 43];
  const crossDone = s => crossIndices.every(i => s[i] === s[Math.floor(i / 9) * 9 + 4]);

  await page.goto(`${origin}?mode=crossf2l&wideverify=${Date.now()}`);
  await page.waitForFunction(() => window.__crossF2L?.solutions?.length);
  await page.getByText('指法推荐', { exact: true }).first().click();
  if (!await page.locator('[data-wide-cross]').count()) throw new Error('CrossF2L 缺少宽转区');
  if (await page.evaluate(() => window.__crossF2L.wideBusy)) throw new Error('折叠状态提前搜索');
  await page.locator('[data-wide-cross] > button').first().click();
  await page.waitForFunction(() => !window.__crossF2L.wideBusy, null, { timeout: 180000 });
  const cross = await page.evaluate(() => {
    const a = window.__crossF2L;
    return { count: a.wideRecommendations.length, rejected: a.wideRejected, error: a.wideError };
  });
  for (let attempt = 0; cross.count === 0 && attempt < 8; attempt++) {
    const generation = await page.evaluate(async () => {
      const a = window.__crossF2L;
      await a.rescramble();
      await a.openRecommendations();
      const previous = a.wideRequestId;
      void a.toggleWide();
      return previous;
    });
    await page.waitForFunction(previous => window.__crossF2L.wideRequestId > previous
      && !window.__crossF2L.wideBusy, generation, { timeout: 180000 });
    const state = await page.evaluate(() => ({ count: window.__crossF2L.wideRecommendations.length,
      rejected: window.__crossF2L.wideRejected, error: window.__crossF2L.wideError }));
    Object.assign(cross, state);
  }
  if (cross.error) throw new Error(cross.error);
  if (!cross.count) throw new Error('8 轮 CrossF2L 打乱均无可播放宽转候选');
  for (const item of await page.evaluate(() => window.__crossF2L.wideRecommendations)) {
    if (item.depth > 8 || !item.physicalMoves.some(m => /^[ud]/.test(m))) throw new Error('宽转步数或记号无效');
    if (item.route.steps.length !== item.displayMoves.length || item.route.steps.some((step, i) => step.movement !== item.displayMoves[i]))
      throw new Error('CrossF2L 宽转指法未与播放公式一致');
  }
  if (cross.count) {
    const card = page.locator('[data-wide-cross] .recommendation-item').first();
    const original = await page.evaluate(() => window.__crossF2L.solutions.slice());
    await card.getByText('选择').click();
    await card.getByText('▶').click();
    await page.waitForFunction(() => window.__crossF2L.world.cube.twister.length === 0
      && [...window.__crossF2L.world.cube.locks.values()].every(lock => lock.size === 0), null, { timeout: 30000 });
    const replay = await page.evaluate(() => ({ state: window.__crossF2L.world.cube.serialize() }));
    // compare outside the page to avoid mutating app state
    if (!crossDone(replay.state) || JSON.stringify(original) !== JSON.stringify(await page.evaluate(() => window.__crossF2L.solutions)))
      throw new Error('CrossF2L 播放未形成十字或改变原推荐');
  }

  await page.goto(`${origin}?mode=blecross&wideverify=${Date.now()}`);
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.getByText('新打乱', { exact: true }).first().click();
  await page.getByText('指法推荐', { exact: true }).first().click();
  if (!await page.locator('[data-wide-cross]').count()) throw new Error('BLECross 缺少宽转区');
  await page.locator('[data-wide-cross] > button').first().click();
  await page.waitForFunction(() => !window.__bleCross.wideBusy, null, { timeout: 180000 });
  const ble = await page.evaluate(() => ({ count: window.__bleCross.wideRecommendations.length,
    rejected: window.__bleCross.wideRejected, error: window.__bleCross.wideError }));
  for (let attempt = 0; ble.count === 0 && attempt < 8; attempt++) {
    const generation = await page.evaluate(async () => {
      const a = window.__bleCross;
      a.closeRecommendations();
      await a.newScramble();
      await a.openRecommendations();
      const previous = a.wideRequestId;
      void a.toggleWide();
      return previous;
    });
    await page.waitForFunction(previous => window.__bleCross.wideRequestId > previous
      && !window.__bleCross.wideBusy, generation, { timeout: 180000 });
    ble.count = await page.evaluate(() => window.__bleCross.wideRecommendations.length);
    ble.rejected = await page.evaluate(() => window.__bleCross.wideRejected);
    ble.error = await page.evaluate(() => window.__bleCross.wideError);
  }
  if (ble.error) throw new Error(ble.error);
  if (!ble.count) throw new Error('8 轮 BLE 打乱均无可播放宽转候选');
  if (!await page.evaluate(() => window.__bleCross.wideRecommendations.every(item =>
    item.route.steps.length === item.displayMoves.length &&
    item.route.steps.every((step, i) => step.movement === item.displayMoves[i]))))
    throw new Error('BLE 宽转指法未与播放公式一致');
  if (ble.count) {
    const card = page.locator('[data-wide-cross] .ble-recommendation-item').first();
    const before = await page.evaluate(() => window.__bleCross.analysisCoreBase);
    // Seed a previously recorded turn to catch accidental history.clear() in preview reset.
    await page.evaluate(() => window.__bleCross.world.cube.history.record({ sign: 'R', reverse: false, times: 1 }));
    const historyBefore = await page.evaluate(() => window.__bleCross.world.cube.history.exp);
    await card.click();
    await card.getByTitle('播放').click();
    await page.waitForFunction(() => !window.__bleCross.playingBest, null, { timeout: 30000 });
    const after = await page.evaluate(() => ({ state: window.__bleCross.world.cube.serialize(),
      base: window.__bleCross.analysisCoreBase, history: window.__bleCross.world.cube.history.exp }));
    if (after.base !== before || !crossDone(after.state) || after.history !== historyBefore)
      throw new Error('BLE 视觉预览污染账本或十字未成');
    await card.getByTitle('返回起点').click();
    // A live MOVE must take ownership of the scene, not continue from the recommendation preview.
    await card.getByTitle('下一步').click();
    await page.waitForFunction(() => !window.__bleCross.playingBest, null, { timeout: 30000 });
    await page.evaluate(() => window.__bleCross.onMoveEvent('R'));
    await page.waitForFunction(() => !window.__bleCross.playingBest
      && window.__bleCross.world.cube.twister.length === 0, null, { timeout: 30000 });
    const interrupted = await page.evaluate(() => ({ selected: window.__bleCross.selectedRecommendationId,
      open: window.__bleCross.wideOpen, base: window.__bleCross.analysisCoreBase,
      history: window.__bleCross.world.cube.history.exp }));
    if (interrupted.selected !== null || interrupted.open || interrupted.base !== before ||
      !interrupted.history.startsWith(historyBefore))
      throw new Error(`实时 MOVE 未中断宽转预览：${JSON.stringify(interrupted)}`);
  }
  await page.locator('.ble-recommendation-panel .ble-recommendation-toolbar').getByText('关闭').click();
  if (!await page.evaluate(() => window.__bleCross.z2On)) await page.getByRole('button', { name: 'z2' }).first().click();
  await page.getByRole('button', { name: "y'" }).first().click();
  await page.waitForTimeout(700);
  // View-button animation can invalidate an open recommendation; start after it settles.
  if (!await page.evaluate(() => window.__bleCross.recommendationOpen))
    await page.getByText('指法推荐', { exact: true }).first().click();
  if (!await page.evaluate(() => window.__bleCross.recommendationOpen))
    await page.getByText('指法推荐', { exact: true }).first().click();
  await page.locator('[data-wide-cross] > button').first().click();
  await page.waitForFunction(() => !window.__bleCross.wideBusy, null, { timeout: 180000 });
  const white = await page.evaluate(() => ({ count: window.__bleCross.wideRecommendations.length,
    error: window.__bleCross.wideError, white: window.__bleCross.z2On,
    mapped: window.__bleCross.wideRecommendations.every(item => item.physicalMoves.some(m => /^d/.test(m)) &&
      item.displayMoves.some(m => /^u/.test(m))) }));
  for (let attempt = 0; white.count === 0 && attempt < 8; attempt++) {
    const generation = await page.evaluate(async () => {
      const a = window.__bleCross;
      a.closeRecommendations();
      await a.newScramble();
      await a.openRecommendations();
      const previous = a.wideRequestId;
      void a.toggleWide();
      return previous;
    });
    await page.waitForFunction(previous => window.__bleCross.wideRequestId > previous
      && !window.__bleCross.wideBusy, generation, { timeout: 180000 });
    const state = await page.evaluate(() => ({ count: window.__bleCross.wideRecommendations.length,
      error: window.__bleCross.wideError, white: window.__bleCross.z2On,
      mapped: window.__bleCross.wideRecommendations.every(item => item.physicalMoves.some(m => /^d/.test(m)) &&
        item.displayMoves.some(m => /^u/.test(m))) }));
    Object.assign(white, state);
  }
  if (!white.white || white.error || !white.count || !white.mapped)
    throw new Error(`白底／y' 映射异常：${JSON.stringify(white)}`);
  if (!await page.evaluate(() => window.__bleCross.wideRecommendations.every(item =>
    item.route.estimated === item.displayMoves.some(move => move[0] === 'd') &&
    item.route.steps.length === item.displayMoves.length &&
    item.route.steps.every((step, i) => step.movement === item.displayMoves[i]))))
    throw new Error('白底宽转指法未映射到显示公式');
  const whiteCard = page.locator('[data-wide-cross] .ble-recommendation-item').first();
  const whiteBase = await page.evaluate(() => window.__bleCross.analysisCoreBase);
  await whiteCard.click();
  await whiteCard.getByTitle('播放').click();
  await page.waitForFunction(() => !window.__bleCross.playingBest &&
    window.__bleCross.world.cube.twister.length === 0, null, { timeout: 30000 });
  const whitePlayback = await page.evaluate(base => {
    const a = window.__bleCross;
    // The recommendation's front is a presentation rotation not included in
    // mapStateForJudge's training view chain. Check all equivalent y orientations.
    let solved = false;
    for (let n = 0; n < 4; n++) {
      solved = a.isTrainDone(a.mapStateForJudge(a.world.cube.serialize())) || solved;
      for (const group of a.world.cube.table.groups.y) group.twist(Math.PI / 2, true);
    }
    return { unchanged: a.analysisCoreBase === base, solved };
  }, whiteBase);
  if (!whitePlayback.unchanged || !whitePlayback.solved)
    throw new Error(`白底播放未形成目标十字或改动训练基准：${JSON.stringify(whitePlayback)}`);
  await whiteCard.getByTitle('返回起点').click();
  return { cross, ble, white };
}
