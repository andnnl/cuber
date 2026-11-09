async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto(`http://127.0.0.1:18115/?mode=formulatimer&rendercheck=${Date.now()}`);
  await page.locator('.formula-timer-root').waitFor();
  const results = await page.evaluate(async () => {
    const view = window.__appShell.currentView();
    clearInterval(view.clockTick);
    view.training.cancel();
    const sample = {...view.current, at:new Date(2026, 0, 2, 12, 34, 56).getTime(),
      result:'success', reactionMs:500, durationMs:1234, moveCount:6};
    const measurements = [];
    for (const size of [0, 500]) {
      view.records = Array.from({length:size}, (_, index) => ({...sample, at:sample.at - index * 1000}));
      await view.$nextTick();
      for (const open of [false, true]) {
        const details = Array.from(document.querySelectorAll('details')).find(element => element.querySelector('summary').textContent.includes('训练记录'));
        details.open = open;
        let formatted = 0;
        const original = Date.prototype.toISOString;
        Date.prototype.toISOString = function () { formatted++; return original.call(this); };
        const started = performance.now();
        try {
          for (let iteration = 0; iteration < 10; iteration++) {
            view.now += 30;
            view.$forceUpdate();
            await view.$nextTick();
          }
        } finally { Date.prototype.toISOString = original; }
        measurements.push({records:size, open, renderMs:(performance.now() - started) / 10, formatted});
      }
    }
    return measurements;
  });
  for (const result of results) assert(result.formatted === 0,
    `计时刷新不应重复格式化历史记录：${JSON.stringify(result)}`);
  const records = page.locator('details').filter({has:page.locator('summary', {hasText:'训练记录'})});
  assert(await records.locator('tbody tr').count() === 50, '每页最多渲染 50 条记录');
  const pagination = records.getByRole('navigation', {name:'训练记录分页'});
  assert((await pagination.innerText()).includes('1 / 10'), '500 条记录应分为 10 页');
  await pagination.getByRole('button', {name:'下一页', exact:true}).click();
  assert((await pagination.innerText()).includes('2 / 10'), '下一页应生效');
  assert(await records.locator('tbody tr').first().locator('time').innerText() === '12:34:06', '第二页应显示后续记录');
  await pagination.getByRole('button', {name:'上一页', exact:true}).click();
  assert(await records.locator('tbody tr').first().locator('time').innerText() === '12:34:56', '时间格式应保持时分秒');
  await records.locator('select').selectOption('idle-failure');
  assert(await records.locator('tbody td[colspan="8"]').count() === 1, '筛选结果应即时刷新');
  await records.locator('select').selectOption('all');
  const follow = await page.evaluate(async () => {
    const view = window.__appShell.currentView();
    view.clearNextJob();
    view.training.cancel();
    view.unscoredRound = false;
    const moves = ['R', 'U', "R'", "U'", 'F', 'D', "F'", "D'", 'L', 'B', "L'", "B'"];
    for (const move of moves) {
      view.playPhysicalMove(move, Date.now());
      view.$forceUpdate();
      await view.$nextTick();
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    const finished = performance.now();
    const aligned = () => view.world.cube.twister.length === 0 &&
      !Array.from(view.world.cube.locks.values()).some(lock => lock.size > 0);
    while (!aligned() && performance.now() - finished < 1500) {
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    return {moves:moves.length, remaining:view.world.cube.twister.length, aligned:aligned(),
      catchupMs:performance.now() - finished};
  });
  assert(follow.aligned && follow.catchupMs < 750, `连续实体动作不应长期积压：${JSON.stringify(follow)}`);
  await page.evaluate(async () => {
    const view = window.__appShell.currentView();
    view.records = [{...view.records[0], name:'新记录测试', at:new Date(2026, 0, 2, 23, 45, 6).getTime()}, ...view.records];
    await view.$nextTick();
  });
  assert(await records.locator('tbody tr').count() === 50, '新增记录仍遵守分页上限');
  assert((await pagination.innerText()).includes('1 / 11'), '新增成绩回到第一页');
  assert(await records.locator('tbody tr').first().locator('time').innerText() === '23:45:06', '新增记录时间应正确');
  await records.locator('tbody tr').first().getByRole('button', {name:'复盘题面'}).click();
  assert(await page.evaluate(() => window.__appShell.currentView().replayRecord.name === '新记录测试'), '复盘应使用对应记录');
  await page.evaluate(async () => {
    const view = window.__appShell.currentView();
    const sample = view.records[0];
    view.records = Array.from({length:1200}, (_, index) => ({...sample, at:sample.at - index * 1000}));
    await view.$nextTick();
  });
  assert((await pagination.innerText()).includes('1 / 20'), '最多浏览 1000 条，即 20 页');
  assert(await pagination.getByRole('button', {name:'上一页', exact:true}).isDisabled(), '第一页不能继续向前翻页');
  for (let index = 1; index < 20; index++) await pagination.getByRole('button', {name:'下一页', exact:true}).click();
  assert((await pagination.innerText()).includes('20 / 20'), '应能浏览最后一页');
  assert(await pagination.getByRole('button', {name:'下一页', exact:true}).isDisabled(), '最后一页不能越界');
  assert(await records.locator('tbody tr').count() === 50, '最后一页也只渲染 50 条');
  assert(await page.evaluate(() => window.__appShell.currentView().records.length === 1200), '分页不能删除完整历史');
  return {passed:true, measurements:results, follow};
}
