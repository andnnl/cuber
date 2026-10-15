async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.getByText('新打乱').first().click();
  await page.waitForFunction(() => window.__bleCross.phase === 'observing');
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => window.__bleCross.recommendations.length || window.__bleCross.recommendationError, null, { timeout: 180000 });
  if (await page.evaluate(() => !!window.__bleCross.recommendationError)) throw new Error('推荐搜索失败');

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
      })),
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
        actual.steps.length !== expected.steps || actual.steps.some(step => step.display !== 'block' || !step.text)) {
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
  if (await controls.locator('button').count() !== 4) throw new Error('推荐卡片缺少上一步/下一步/播放/GIF 控件');
  const formula = await page.evaluate(() => window.__bleCross.visibleRecommendations[0].physicalMoves.join(' '));
  await controls.getByTitle('下一步').click();
  await page.waitForFunction(f => window.__bleCross.bestStepAt(f) === 1 && !window.__bleCross.playingBest, formula);
  await controls.getByTitle('上一步').click();
  await page.waitForFunction(f => window.__bleCross.bestStepAt(f) === 0 && !window.__bleCross.playingBest, formula);
  await controls.getByTitle('播放').click();
  await page.waitForFunction(f => window.__bleCross.bestStepAt(f) === window.__bleCross.bestStepCount(f) && !window.__bleCross.playingBest, formula);
  await page.locator('.ble-recommendation-toolbar button').filter({ hasText: '全屏' }).click();
  const fullscreen = await check('.ble-recommendation-dialog');
  const fullControls = page.locator('.ble-recommendation-dialog .ble-recommendation-item').first().locator('[data-ble-recommend-preview]');
  if (await fullControls.locator('button').count() !== 4) throw new Error('全屏推荐缺少预览控件');
  await fullControls.getByTitle('GIF').click();
  await page.waitForFunction(() => window.__bleCross.gifRecording && window.__bleCross.gifAuto);
  await page.waitForFunction(() => !window.__bleCross.gifRecording, null, { timeout: 30000 });
  const after = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { phase: vm.phase, steps: vm.bestStepAt(vm.visibleRecommendations[0].physicalMoves.join(' ')), moveCount: vm.moveCount, records: vm.records.length, scramble: vm.scrambleText, predicted: vm.predicted };
  });
  if (after.phase !== 'observing' || after.steps !== await page.evaluate(() => window.__bleCross.visibleRecommendations[0].physicalMoves.length)) {
    throw new Error(`GIF 未完整演示所选推荐或改变训练阶段: ${JSON.stringify(after)}`);
  }
  for (const key of Object.keys(trainingBefore)) {
    if (after[key] !== trainingBefore[key]) throw new Error(`预览修改了训练数据 ${key}: ${trainingBefore[key]} → ${after[key]}`);
  }
  return { panel, fullscreen, after };
}
