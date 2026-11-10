async (page) => {
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  const origin = page.url().split('/').slice(0, 3).join('/');
  await page.goto(`${origin}/?mode=crossf2l&verify=${Date.now()}`);
  await page.waitForFunction(() => window.__crossF2L && !window.__crossF2L.solving && window.__crossF2L.solutions.length, null, { timeout: 120000 });
  await page.evaluate(() => window.__crossF2L.setCollapsed(false));
  const checkbox = page.locator('[data-prediction-auto-next]');
  expect(await checkbox.count() === 1, '应提供答对自动下一题复选框');
  await checkbox.uncheck();
  await page.evaluate(() => {
    const trainer = window.__crossF2L;
    trainer.difficulty = 'random';
    trainer.predictCorner = true;
    trainer.predictEdge = true;
    trainer.savePredictionTargets();
  });
  const ready = () => page.waitForFunction(() => !window.__crossF2L.solving && window.__crossF2L.solutions.length, null, { timeout: 120000 });
  const answer = async (kind = 'correct') => {
    await ready();
    return page.evaluate(kind => {
      const trainer = window.__crossF2L;
      trainer.reset();
      trainer.play(); trainer.world.cube.twister.finish();
      const corner = trainer.world.cube.initials[trainer.mappedCornerIndex];
      const edge = trainer.world.cube.initials[trainer.mappedEdgeIndex];
      const answer = { corner: corner.index, edge: edge.index, cornerFace: trainer.stickerFace(corner, trainer.cornerSticker), edgeFace: trainer.stickerFace(edge, trainer.edgeSticker) };
      trainer.reset();
      trainer.predictedCornerIndex = answer.corner;
      trainer.predictedCornerFace = kind === 'wrong' ? 'invalid' : kind === 'incomplete' ? '' : answer.cornerFace;
      trainer.predictedEdgeIndex = answer.edge;
      trainer.predictedEdgeFace = answer.edgeFace;
      trainer.play(); trainer.world.cube.twister.finish();
      return trainer.scramble;
    }, kind);
  };
  const unchanged = async (scramble, message) => {
    await page.waitForTimeout(1100);
    expect(await page.evaluate(() => window.__crossF2L.scramble) === scramble, message);
  };
  let scramble = await answer();
  await unchanged(scramble, '未勾选时答对不能自动切题');
  await checkbox.check();
  expect(await page.evaluate(() => localStorage.getItem('trainerAutoNext')) === '1', '应保存自动切题设置');
  const restoredPage = await page.context().newPage();
  try {
    await restoredPage.goto(`${origin}/?mode=crossf2l`);
    await restoredPage.waitForFunction(() => window.__crossF2L);
    expect(await restoredPage.evaluate(() => window.__crossF2L.autoNext), '重新打开应记住勾选状态');
  } finally {
    await restoredPage.close();
  }
  scramble = await answer();
  await page.waitForFunction(previous => window.__crossF2L.scramble !== previous, scramble, { timeout: 10000 });
  const next = await page.evaluate(() => ({ scramble: window.__crossF2L.scramble, phase: window.__crossF2L.phase, corner: window.__crossF2L.predictedCornerIndex, edge: window.__crossF2L.predictedEdgeIndex }));
  expect(next.phase === 'idle' && next.corner === null && next.edge === null, '自动切题应重置预判');
  await unchanged(next.scramble, '一次正确判定只能自动切一题');
  await unchanged(await answer('wrong'), '答错不能自动切题');
  await unchanged(await answer('incomplete'), '未完成预判不能自动切题');
  scramble = await answer();
  await checkbox.uncheck();
  await unchanged(scramble, '取消勾选应取消待执行切题');
  await checkbox.check();
  scramble = await answer();
  await page.evaluate(() => window.__crossF2L.reset());
  await unchanged(scramble, '重置应取消待执行切题');
  scramble = await answer();
  await page.evaluate(() => window.__crossF2L.rescramble());
  const manual = await page.evaluate(() => window.__crossF2L.scramble);
  expect(manual !== scramble, '手动打乱应生效');
  await unchanged(manual, '手动切题后不能被旧任务再次切题');
  scramble = await answer();
  await page.evaluate(() => window.__crossF2L.onAppDeactivate());
  await unchanged(scramble, '离开页面应取消待执行切题');
  await page.evaluate(() => window.__crossF2L.onAppActivate());
  await checkbox.uncheck();
  return { autoNext: 'passed', persistence: 'passed', cancellation: 'passed' };
}
