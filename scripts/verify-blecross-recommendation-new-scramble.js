async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross?.world);
  await page.getByText('新打乱').first().click();
  await page.waitForFunction(() => window.__bleCross.phase === 'observing');
  await page.locator('[data-ble-recommend-open]').click();
  await page.waitForFunction(() => window.__bleCross.recommendations.length || window.__bleCross.recommendationError, null, { timeout: 180000 });
  if (await page.evaluate(() => !!window.__bleCross.recommendationError)) throw new Error('初始推荐搜索失败');

  const verify = async (selector, fullscreen) => {
    const toolbar = page.locator(`${selector} .ble-recommendation-toolbar`);
    const buttons = toolbar.locator('button');
    const refresh = buttons.filter({ hasText: '新打乱' });
    if (await refresh.count() !== 1 || await buttons.allTextContents().then(labels => labels.indexOf('新打乱') !== labels.indexOf('关闭') + 1)) {
      throw new Error(`${selector} 新打乱未放在关闭右侧`);
    }
    const before = await page.evaluate(() => ({
      scramble: window.__bleCross.scramble,
      base: window.__bleCross.analysisCoreBase,
      ids: window.__bleCross.recommendations.map(item => item.id),
    }));
    await refresh.click();
    await page.waitForFunction(({ scramble, base }) => {
      const vm = window.__bleCross;
      return vm.scramble !== scramble && vm.analysisCoreBase !== base && !vm.recommendationBusy &&
        (vm.recommendations.length > 0 || !!vm.recommendationError);
    }, before, { timeout: 180000 });
    const after = await page.evaluate(() => ({
      open: window.__bleCross.recommendationOpen,
      full: window.__bleCross.recommendationFull,
      base: window.__bleCross.analysisCoreBase,
      count: window.__bleCross.recommendations.length,
      error: window.__bleCross.recommendationError,
      phase: window.__bleCross.phase,
    }));
    if (!after.open || after.full !== fullscreen || !after.count || after.error || after.phase !== 'observing') {
      throw new Error(`${selector} 未保持视图并刷新推荐：${JSON.stringify(after)}`);
    }
    return after;
  };

  const panel = await verify('.ble-recommendation-panel', false);
  await page.locator('.ble-recommendation-panel .ble-recommendation-toolbar button').filter({ hasText: '全屏' }).click();
  const dialog = await verify('.ble-recommendation-dialog', true);
  const deferred = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const original = vm.newScramble;
    vm.newScramble = async function () {
      this.invalidateRecommendations();
      await new Promise(resolve => setTimeout(resolve, 80));
      this.startScramble('R U');
    };
    try {
      const task = vm.newScrambleWithRecommendations();
      const waiting = { open: vm.recommendationOpen, full: vm.recommendationFull,
        busy: vm.recommendationBusy, count: vm.recommendations.length };
      await task;
      return { waiting, open: vm.recommendationOpen, full: vm.recommendationFull,
        busy: vm.recommendationBusy, count: vm.recommendations.length, scramble: vm.scramble };
    } finally {
      vm.newScramble = original;
    }
  });
  if (!deferred.waiting.open || !deferred.waiting.full || !deferred.waiting.busy || deferred.waiting.count ||
      !deferred.open || !deferred.full || deferred.busy || !deferred.count || deferred.scramble !== 'R U') {
    throw new Error(`异步打乱未保留视图/清空旧结果/重新搜索：${JSON.stringify(deferred)}`);
  }

  const failure = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const original = vm.newScramble;
    vm.newScramble = async function () {
      this.invalidateRecommendations();
      this.scrambleGenerationId++;
      this.statusText = '难度生成失败: 测试错误';
    };
    try {
      await vm.newScrambleWithRecommendations();
      return { open: vm.recommendationOpen, full: vm.recommendationFull,
        error: vm.recommendationError, count: vm.recommendations.length };
    } finally {
      vm.newScramble = original;
    }
  });
  if (!failure.open || !failure.full || failure.count || !failure.error.includes('难度生成失败')) {
    throw new Error(`失败后残留旧推荐或关闭全屏：${JSON.stringify(failure)}`);
  }
  const closed = await page.evaluate(async () => {
    const vm = window.__bleCross;
    const original = vm.newScramble;
    vm.newScramble = async function () {
      this.invalidateRecommendations();
      await new Promise(resolve => setTimeout(resolve, 50));
      this.startScramble('F R');
    };
    try {
      const task = vm.newScrambleWithRecommendations();
      vm.closeRecommendations();
      await task;
      return { open: vm.recommendationOpen, full: vm.recommendationFull, busy: vm.recommendationBusy };
    } finally {
      vm.newScramble = original;
    }
  });
  if (closed.open || closed.full || closed.busy) throw new Error(`用户关闭后被异步结果重新打开：${JSON.stringify(closed)}`);
  return { panel, dialog, deferred, failure, closed };
}
