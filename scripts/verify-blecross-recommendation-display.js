async page => {
  await page.goto(page.url().includes('mode=blecross') ? page.url() : 'http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.getByText('新打乱').first().click();
  await page.waitForFunction(() => window.__bleCross.phase === 'observing');
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => window.__bleCross.recommendations.length || window.__bleCross.recommendationError, null, { timeout: 180000 });
  if (await page.evaluate(() => !!window.__bleCross.recommendationError)) throw new Error('推荐搜索失败');

  await page.evaluate(() => { window.__bleCross.recommendationAll = true; });
  const oriented = await page.evaluate(() => {
    const vm = window.__bleCross;
    const index = vm.visibleRecommendations.findIndex(item => item.front === 'R');
    if (index < 0) throw new Error('缺少 R 正面推荐');
    const item = vm.visibleRecommendations[index];
    const center = vm.world.cube.serialize()['URFDLB'.indexOf(item.front) * 9 + 4];
    return { index, center, color: { U: '白', D: '黄', F: '绿', R: '红', B: '蓝', L: '橙' }[center],
      formula: item.physicalMoves.join(' '), displayed: item.displayMoves.join(' ') };
  });
  const orientedCard = page.locator('.ble-recommendation-panel .ble-recommendation-item').nth(oriented.index);
  if (!(await orientedCard.locator('b').first().textContent()).includes(`R ${oriented.color}前`)) {
    throw new Error(`R 正面推荐的颜色应为 ${oriented.color}`);
  }
  await orientedCard.click();
  const previewMoves = await page.evaluate(formula => window.__bleCross.bestMovesOf(formula, window.__bleCross.selectedRecommendation).join(' '), oriented.formula);
  if (previewMoves !== oriented.displayed) throw new Error(`预览记号未按推荐朝向转换：${previewMoves} ≠ ${oriented.displayed}`);
  await orientedCard.locator('[data-ble-recommend-preview]').getByTitle('播放').click();
  await page.waitForFunction(() => window.__bleCross.playingBest, null, { timeout: 5000 });
  await page.waitForFunction(() => !window.__bleCross.playingBest, null, { timeout: 30000 });
  const frontCenter = await page.evaluate(() => window.__bleCross.world.cube.serialize()[22]);
  if (frontCenter !== oriented.center) throw new Error(`预览未转正推荐朝向：正面中心 ${frontCenter} ≠ ${oriented.center}`);
  for (const front of ['F', 'L', 'B']) {
    const item = await page.evaluate(target => {
      const vm = window.__bleCross;
      const index = vm.visibleRecommendations.findIndex(entry => entry.front === target);
      if (index < 0) throw new Error(`缺少 ${target} 朝向推荐`);
      const selected = vm.visibleRecommendations[index];
      return { index, formula: selected.physicalMoves.join(' '), displayed: selected.displayMoves.join(' ') };
    }, front);
    const card = page.locator('.ble-recommendation-panel .ble-recommendation-item').nth(item.index);
    await card.click();
    const moves = await page.evaluate(formula => window.__bleCross.bestMovesOf(formula, window.__bleCross.selectedRecommendation).join(' '), item.formula);
    if (moves !== item.displayed) throw new Error(`${front} 预览记号与卡片不同`);
    await card.locator('[data-ble-recommend-preview]').getByTitle('下一步').click();
    await page.waitForFunction(formula => window.__bleCross.bestStepAt(formula, window.__bleCross.selectedRecommendation) === 1 && !window.__bleCross.playingBest, item.formula);
    const previewCenter = await page.evaluate(() => window.__bleCross.world.cube.serialize()[22]);
    // 标签采用搜索时的固定快照；从当前推荐卡片取得原始中心块身份。
    const label = await card.locator('b').first().textContent();
    const color = { U: '白', D: '黄', F: '绿', R: '红', B: '蓝', L: '橙' }[previewCenter];
    if (!label.includes(`${front} ${color}前`)) throw new Error(`${front} 步进前未转正：${label} / ${previewCenter}`);
  }

  const check = async (selector) => {
    const card = page.locator(`${selector} .ble-recommendation-item`).first();
    await card.click();
    const expected = await page.evaluate(() => {
      const vm = window.__bleCross;
      const item = vm.visibleRecommendations[0];
      return {
        score: Number(item.route.score).toFixed(2),
        left: item.route.start_left,
        right: item.route.start_right,
        steps: item.route.steps.length,
      };
    });
    const actual = await card.evaluate(element => ({
      summary: element.querySelector('.ble-grip-summary')?.textContent || '',
      start: element.querySelector('.ble-grip-start')?.textContent || '',
      steps: [...element.querySelectorAll('.ble-grip-step')].map(node => ({
        text: node.textContent || '', display: getComputedStyle(node).display,
        fontSize: parseFloat(getComputedStyle(node).fontSize),
      })),
      startFontSize: parseFloat(getComputedStyle(element.querySelector('.ble-grip-start')).fontSize),
      layout: (() => {
        const formula = element.querySelector('.ble-recommendation-formula');
        const controls = element.querySelector('[data-ble-recommend-preview]');
        if (!formula || !controls) return null;
        const a = formula.getBoundingClientRect();
        const b = controls.getBoundingClientRect();
        return { formulaRight: a.right, formulaTop: a.top, controlsLeft: b.left, controlsTop: b.top, controlsRight: b.right, viewport: innerWidth };
      })(),
    }));
    if (!actual.summary.includes(`指法分 ${expected.score}`) ||
        !actual.start.includes(`左手 ${expected.left}`) || !actual.start.includes(`右手 ${expected.right}`) ||
        actual.steps.length !== expected.steps || actual.startFontSize < 14 ||
        actual.steps.some(step => step.display !== 'block' || !step.text || step.fontSize < 14)) {
      throw new Error(`${selector} 指法显示异常: ${JSON.stringify({ expected, actual })}`);
    }
    if (!actual.layout || actual.layout.controlsLeft < actual.layout.formulaRight - 1 ||
        Math.abs(actual.layout.controlsTop - actual.layout.formulaTop) > 4 ||
        actual.layout.controlsRight > actual.layout.viewport + 1) {
      throw new Error(`${selector} 控件没有紧贴公式右侧: ${JSON.stringify(actual.layout)}`);
    }
    return { score: expected.score, steps: actual.steps.length, start: actual.start };
  };

  await page.setViewportSize({ width: 1280, height: 800 });
  await check('.ble-recommendation-panel');
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await check('.ble-recommendation-panel');
  const trainingBefore = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { phase: vm.phase, moveCount: vm.moveCount, records: vm.records.length, scramble: vm.scrambleText, predicted: vm.predicted };
  });
  const preview = page.locator('.ble-recommendation-panel .ble-recommendation-item').first();
  const controls = preview.locator('[data-ble-recommend-preview]');
  if (await controls.locator('button').count() !== 5) throw new Error('推荐卡片缺少返回起点/上一步/下一步/播放/GIF 控件');
  if (await controls.locator('button').first().getAttribute('title') !== '返回起点') throw new Error('返回起点必须位于上一步之前');
  const formula = await page.evaluate(() => window.__bleCross.visibleRecommendations[0].physicalMoves.join(' '));
  const originalPos = await page.evaluate(f => window.__bleCross.bestStepAt(f, window.__bleCross.selectedRecommendation), formula);
  await controls.getByTitle('下一步').click();
  await page.waitForFunction(({ f, pos }) => window.__bleCross.bestStepAt(f, window.__bleCross.selectedRecommendation) === pos + 1 && !window.__bleCross.playingBest, { f: formula, pos: originalPos });
  await controls.getByTitle('上一步').click();
  await page.waitForFunction(({ f, pos }) => window.__bleCross.bestStepAt(f, window.__bleCross.selectedRecommendation) === pos && !window.__bleCross.playingBest, { f: formula, pos: originalPos });
  const expectedStart = await page.evaluate(() => window.__bleCross.world.cube.serialize());
  await controls.getByTitle('播放').click();
  await page.waitForFunction(f => window.__bleCross.bestStepAt(f, window.__bleCross.selectedRecommendation) === window.__bleCross.bestStepCount(f, window.__bleCross.selectedRecommendation) && !window.__bleCross.playingBest, formula);
  await controls.getByTitle('返回起点').click();
  const reset = await page.evaluate(f => {
    const vm = window.__bleCross;
    const item = vm.visibleRecommendations[0];
    return { state: vm.world.cube.serialize(), steps: vm.bestStepAt(f, item),
      front: vm.world.cube.serialize()[22], phase: vm.phase, moveCount: vm.moveCount,
      records: vm.records.length, scramble: vm.scrambleText, predicted: vm.predicted };
  }, formula);
  if (reset.steps !== 0 || reset.state !== expectedStart) throw new Error(`返回起点没有恢复贴纸、朝向和游标: ${JSON.stringify(reset)}`);
  await controls.getByTitle('下一步').click();
  await page.waitForFunction(f => window.__bleCross.bestStepAt(f, window.__bleCross.selectedRecommendation) === 1 && !window.__bleCross.playingBest, formula);
  await controls.getByTitle('返回起点').click();
  if (await page.evaluate(f => window.__bleCross.bestStepAt(f, window.__bleCross.selectedRecommendation), formula) !== 0) throw new Error('单步后返回起点未清游标');
  await page.locator('.ble-recommendation-toolbar button').filter({ hasText: '全屏' }).click();
  const fullscreen = await check('.ble-recommendation-dialog');
  const fullControls = page.locator('.ble-recommendation-dialog .ble-recommendation-item').first().locator('[data-ble-recommend-preview]');
  if (await fullControls.locator('button').count() !== 5) throw new Error('全屏推荐缺少预览控件');
  await fullControls.getByTitle('下一步').click();
  await page.waitForFunction(f => window.__bleCross.bestStepAt(f, window.__bleCross.selectedRecommendation) === 1 && !window.__bleCross.playingBest, formula);
  await fullControls.getByTitle('返回起点').click();
  if (await page.evaluate(f => window.__bleCross.bestStepAt(f, window.__bleCross.selectedRecommendation), formula) !== 0) throw new Error('全屏返回起点未清游标');
  await fullControls.getByTitle('GIF').click();
  await page.waitForFunction(() => window.__bleCross.gifRecording && window.__bleCross.gifAuto);
  await page.waitForFunction(() => !window.__bleCross.gifRecording, null, { timeout: 30000 });
  const after = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { phase: vm.phase, steps: vm.bestStepAt(vm.visibleRecommendations[0].physicalMoves.join(' '), vm.visibleRecommendations[0]), moveCount: vm.moveCount, records: vm.records.length, scramble: vm.scrambleText, predicted: vm.predicted };
  });
  if (after.phase !== 'observing' || after.steps !== await page.evaluate(() => window.__bleCross.visibleRecommendations[0].physicalMoves.length)) {
    throw new Error(`GIF 未完整演示所选推荐或改变训练阶段: ${JSON.stringify(after)}`);
  }
  for (const key of Object.keys(trainingBefore)) {
    if (after[key] !== trainingBefore[key]) throw new Error(`预览修改了训练数据 ${key}: ${trainingBefore[key]} → ${after[key]}`);
    if (reset[key] !== trainingBefore[key]) throw new Error(`返回起点修改了训练数据 ${key}: ${trainingBefore[key]} → ${reset[key]}`);
  }
  return { panel, fullscreen, after };
}
