async page => {
  await page.goto(page.url().includes('mode=blecross') ? page.url() : 'http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.getByText('新打乱').first().click();
  await page.waitForFunction(() => window.__bleCross.phase === 'observing');
  await page.getByRole('button', { name: 'z2', exact: true }).click();
  await page.getByRole('button', { name: "y'", exact: true }).click();
  await page.waitForFunction(() => window.__bleCross.effectiveViewOps().some(op => op.axis === 'y'));
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => window.__bleCross.recommendations.length || window.__bleCross.recommendationError, null, { timeout: 180000 });
  const result = await page.evaluate(() => {
    const vm = window.__bleCross;
    if (vm.recommendationError) throw new Error(vm.recommendationError);
    const screen = vm.world.cube.serialize();
    const originalColor = { U: '白', D: '黄', F: '绿', R: '红', B: '蓝', L: '橙' };
    const faces = [...'FLBR'];
    const labels = faces.map(front => {
      const center = screen['URFDLB'.indexOf(front) * 9 + 4];
      return { front, center, expected: `${front} ${originalColor[center]}前`, actual: vm.recommendationFrontLabel(front) };
    });
    return { labels, z2On: vm.z2On, ops: vm.recommendationViewOps };
  });
  for (const label of result.labels) {
    if (label.expected !== label.actual) throw new Error(`z2/y' 朝向不符：${JSON.stringify({ result, label })}`);
    const options = await page.locator('.ble-recommendation-panel [aria-label="观察正面"] option').allTextContents();
    if (!options.includes(label.expected)) throw new Error(`筛选项缺少 ${label.expected}`);
  }
  await page.evaluate(() => { window.__bleCross.recommendationAll = true; });
  const item = await page.evaluate(() => {
    const vm = window.__bleCross;
    const index = vm.visibleRecommendations.findIndex(entry => entry.front === 'R');
    if (index < 0) throw new Error('缺少 R 朝向推荐');
    return { index, formula: vm.visibleRecommendations[index].physicalMoves.join(' '),
      displayed: vm.visibleRecommendations[index].displayMoves.join(' ') };
  });
  const card = page.locator('.ble-recommendation-panel .ble-recommendation-item').nth(item.index);
  await card.click();
  if (await page.evaluate(formula => window.__bleCross.bestMovesOf(formula, window.__bleCross.selectedRecommendation).join(' '), item.formula) !== item.displayed) {
    throw new Error('z2/y′ 后的演示公式与卡片不一致');
  }
  await card.locator('[data-ble-recommend-preview]').getByTitle('下一步').click();
  await page.waitForFunction(formula => window.__bleCross.bestStepAt(formula, window.__bleCross.selectedRecommendation) === 1 && !window.__bleCross.playingBest, item.formula);
  const after = await page.evaluate(() => ({ center: window.__bleCross.world.cube.serialize()[22],
    phase: window.__bleCross.phase, moves: window.__bleCross.moveCount }));
  if (after.center !== result.labels.find(label => label.front === 'R').center || after.phase !== 'observing' || after.moves !== 0) {
    throw new Error(`z2/y′ 步进转正或训练数据异常：${JSON.stringify(after)}`);
  }
  await page.goto(page.url());
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.getByText('新打乱').first().click();
  await page.waitForFunction(() => window.__bleCross.phase === 'observing');
  if (await page.evaluate(() => window.__bleCross.z2On)) {
    await page.getByRole('button', { name: 'z2', exact: true }).click();
    await page.evaluate(() => window.__bleCross.world.cube.twister.finish());
  }
  for (let i = 0; i < 4 && await page.evaluate(() => window.__bleCross.world.cube.serialize()[22] !== 'F'); i++) {
    await page.getByRole('button', { name: 'y', exact: true }).click();
    await page.evaluate(() => window.__bleCross.world.cube.twister.finish());
  }
  if (await page.evaluate(() => window.__bleCross.world.cube.serialize()[22] !== 'F')) {
    throw new Error('无法恢复白顶绿前的基准视角');
  }
  await page.getByRole('button', { name: 'y', exact: true }).click();
  await page.evaluate(() => window.__bleCross.world.cube.twister.finish());
  await page.getByRole('button', { name: 'y', exact: true }).click();
  await page.evaluate(() => window.__bleCross.world.cube.twister.finish());
  if (!await page.evaluate(() => window.__bleCross.recommendationOpen)) {
    await page.locator('[data-ble-recommend-open]').click();
  }
  await page.waitForFunction(() => window.__bleCross.recommendationOpen && window.__bleCross.recommendationViewOps.length > 0);
  const y2 = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { center: vm.world.cube.serialize()[40], label: vm.recommendationFrontLabel('L'), ops: vm.effectiveViewOps() };
  });
  if (y2.center !== 'R' || y2.label !== 'L 红前') {
    throw new Error(`y2 后 L 正面应为红前：${JSON.stringify(y2)}`);
  }
  return { ...result, y2 };
}
