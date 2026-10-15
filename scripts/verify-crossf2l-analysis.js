async page => {
  let connected = false;
  for (const port of [18645, 8080, 18081]) {
    try {
      await page.goto(`http://127.0.0.1:${port}/?mode=crossf2l`);
      await page.waitForFunction(() => window.__crossF2L, null, { timeout: 2500 });
      connected = true;
      break;
    } catch { /* Try the next local dev server. */ }
  }
  if (!connected) throw new Error('请先启动本地 webpack 开发服务或 dist 静态服务');
  await page.waitForFunction(() => window.__crossF2L && !window.__crossF2L.solving && window.__crossF2L.solutions.length, null, { timeout: 30000 });
  await page.evaluate(() => { window.__crossF2L.customScramble = 'R U F D L B'; window.__crossF2L.applyCustomScramble(); });
  await page.waitForFunction(() => !window.__crossF2L.solving && window.__crossF2L.solutions.length, null, { timeout: 30000 });
  const initial = await page.evaluate(() => ({ count: window.__crossF2L.recommendations.length, solutions: window.__crossF2L.solutions.length }));
  if (initial.count !== 0 || !initial.solutions) throw new Error('推荐应仅在点击后运行');
  await page.getByText('指法推荐').first().click();
  await page.waitForFunction(() => !window.__crossF2L.recommendationBusy, null, { timeout: 60000 });
  const cross = await page.evaluate(() => ({ count: window.__crossF2L.recommendations.length, visible: document.querySelectorAll('.recommendation-panel .recommendation-item').length }));
  if (!cross.count || cross.visible !== Math.min(4, cross.count)) throw new Error(`Cross 推荐数量异常: ${JSON.stringify(cross)}`);
  await page.getByText('显示全部').first().click();
  const expanded = await page.locator('.recommendation-panel .recommendation-item').count();
  if (expanded !== cross.count) throw new Error('显示全部未覆盖本次候选');
  await page.evaluate(() => { document.querySelector('.recommendation-panel .recommendation-list').scrollTop = 120; });
  await page.getByText('全屏', { exact: true }).first().click();
  if (!(await page.locator('.recommendation-dialog').isVisible())) throw new Error('全屏结果未显示');
  await page.getByText('返回魔方').click();
  if (!(await page.locator('.recommendation-panel').isVisible())) throw new Error('返回未恢复展开区');
  if (cross.count > 4) await page.waitForFunction(() => document.querySelector('.recommendation-panel .recommendation-list').scrollTop >= 80);
  const scroll = await page.evaluate(() => document.querySelector('.recommendation-panel .recommendation-list').scrollTop);
  if (cross.count > 4 && scroll < 80) throw new Error(`返回时滚动位置丢失: ${scroll}`);
  await page.locator('.recommendation-panel .recommendation-item').first().click();
  const selected = await page.evaluate(() => ({ id: window.__crossF2L.selectedRecommendationId, moves: window.__crossF2L.currentSolutionSteps }));
  if (!selected.id || !selected.moves) throw new Error('推荐未成为播放来源');
  await page.getByText('关闭', { exact: true }).first().click();
  await page.evaluate(() => window.__crossF2L.rescramble());
  const cleared = await page.evaluate(() => ({ count: window.__crossF2L.recommendations.length, selected: window.__crossF2L.selectedRecommendationId }));
  if (cleared.count || cleared.selected) throw new Error(`新打乱仍保留旧推荐: ${JSON.stringify(cleared)}`);
  await page.waitForFunction(() => !window.__crossF2L.solving, null, { timeout: 30000 });

  const mode = page.locator('select.solve-mode-select').first();
  await mode.selectOption('xxcross');
  await page.waitForFunction(() => !window.__crossF2L.solving, null, { timeout: 180000 });
  const xx = await page.evaluate(() => ({ solutions: window.__crossF2L.solutions.length, slots: window.__crossF2L.activeSolvedSlots, result: window.__crossF2L.result }));
  if (!xx.solutions || xx.slots.length !== 2) throw new Error(`XXCross 两组结果异常: ${JSON.stringify(xx)}`);
  await page.locator('select.solve-mode-select').nth(1).selectOption('FIXED');
  await page.waitForFunction(() => !window.__crossF2L.solving, null, { timeout: 180000 });
  const xxFixed = await page.evaluate(() => ({ slots: window.__crossF2L.selectedSolveSlots, solutions: window.__crossF2L.solutions.length }));
  if (!xxFixed.solutions || xxFixed.slots.length !== 2) throw new Error(`XXCross 指定两槽异常: ${JSON.stringify(xxFixed)}`);
  await mode.selectOption('xxxcross');
  await page.waitForFunction(() => !window.__crossF2L.solving, null, { timeout: 180000 });
  const xxx = await page.evaluate(() => ({ solutions: window.__crossF2L.solutions.length, slots: window.__crossF2L.activeSolvedSlots, result: window.__crossF2L.result }));
  if (!xxx.solutions || xxx.slots.length !== 3) throw new Error(`XXXCross 三组结果异常: ${JSON.stringify(xxx)}`);
  await page.evaluate(() => window.__crossF2L.play());
  await page.waitForFunction(() => window.__crossF2L.phase === 'judged', null, { timeout: 30000 });
  const judged = await page.evaluate(() => window.__crossF2L.result);
  if (!judged.includes('十字✓、3组F2L') || !judged.includes('未完成预判')) throw new Error(`XXXCross 判定异常: ${judged}`);
  const actual = await page.evaluate(() => {
    const vm = window.__crossF2L;
    return [vm.world.cube.initials[vm.mappedCornerIndex].index, vm.world.cube.initials[vm.mappedEdgeIndex].index];
  });
  await page.evaluate(([corner, edge]) => {
    const vm = window.__crossF2L;
    vm.reset();
    vm.predictedCornerIndex = corner;
    vm.predictedEdgeIndex = edge;
    vm.predictTarget = null;
    vm.play();
  }, actual);
  await page.waitForFunction(() => window.__crossF2L.phase === 'judged', null, { timeout: 30000 });
  const predicted = await page.evaluate(() => window.__crossF2L.result);
  if (!predicted.includes('3组F2L') || !predicted.includes('预判正确')) throw new Error(`XXXCross 预判异常: ${predicted}`);
  return { cross, xx, xxFixed, xxx, judged, predicted };
}
