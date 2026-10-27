async page => {
  const url = `http://127.0.0.1:18082/?mode=pll6&check=${Date.now()}`;
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('pll6ShowCurrentFeatures', '0');
    localStorage.setItem('pll6Records', JSON.stringify([
      { name: 'PLL-Aa', kind: 'observation', durationMs: 400, at: 1000 },
    ]));
  });
  await page.reload();
  await page.waitForSelector('.pll6-panel');
  const checkbox = page.getByRole('checkbox', { name: '显示当前特征' });
  if (await checkbox.isChecked()) throw new Error('特征开关应默认关闭');
  await checkbox.check();
  await page.getByText('六格观察线索', { exact: false }).waitFor();
  await page.reload();
  if (!(await checkbox.isChecked())) throw new Error('特征开关未持久化');
  await checkbox.uncheck();
  if (await page.getByText('六格观察线索', { exact: false }).count()) throw new Error('关闭后仍展示提示');
  const initial = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { name: view.caseName, scramble: view.scramble, facelets: view.world.cube.serialize() };
  });
  const wrong = initial.name === 'Aa' ? 'Ab' : 'Aa';
  await page.getByRole('button', { name: wrong, exact: true }).click();
  const afterWrong = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { name: view.caseName, records: view.records.length, selected: view.records[0].selectedName,
      ok: view.records[0].ok, scramble: view.records[0].scramble };
  });
  if (afterWrong.name !== initial.name || afterWrong.records !== 2 || afterWrong.selected !== `PLL-${wrong}` ||
    afterWrong.ok !== false || afterWrong.scramble !== initial.scramble) throw new Error(`误选记录异常 ${JSON.stringify(afterWrong)}`);
  await page.getByRole('button', { name: initial.name, exact: true }).click();
  const afterCorrect = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { count: view.records.length, correct: view.records[0], wrong: view.records[1],
      current: view.training.current, facelets: view.world.cube.serialize() };
  });
  if (afterCorrect.count !== 3 || afterCorrect.correct.ok !== true ||
    afterCorrect.correct.scramble !== initial.scramble || afterCorrect.wrong.scramble !== initial.scramble ||
    afterCorrect.correct.durationMs < afterCorrect.wrong.durationMs) throw new Error('正确、错误记录或累计计时异常');
  await page.locator('.pll6-records summary').click();
  const oldReplay = page.locator('.pll6-record-row').filter({ hasText: '1970' }).getByRole('button', { name: '复盘' });
  if (await oldReplay.count() !== 1 || !(await oldReplay.isDisabled())) throw new Error('旧记录不应伪造可复盘状态');
  await page.getByRole('combobox', { name: '结果筛选' }).selectOption('incorrect');
  let filtered = await page.evaluate(() => window.__appShell.$refs.activeView.filteredRecords);
  if (filtered.length !== 1 || filtered[0].ok !== false) throw new Error('错误筛选异常');
  await page.getByRole('combobox', { name: 'PLL 筛选' }).selectOption(`PLL-${initial.name}`);
  filtered = await page.evaluate(() => window.__appShell.$refs.activeView.filteredRecords);
  if (filtered.length !== 1) throw new Error('PLL 筛选异常');
  await page.locator('.pll6-record-row').getByRole('button', { name: '复盘' }).click();
  const inReplay = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { facelets: view.world.cube.serialize(), replay: !!view.replayRecord, count: view.records.length };
  });
  if (!inReplay.replay || inReplay.facelets !== initial.facelets || inReplay.count !== 3) throw new Error('复盘未恢复起始状态');
  await page.evaluate(() => {
    const shell = window.__appShell, view = shell.$refs.activeView;
    view.snapshot = { ...shell.snapshot, status: 'connected' };
    shell.dispatch({ type: 'move', move: 'R', serial: 100 });
    shell.dispatch({ type: 'facelets', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', serial: 100 });
    view.answer(view.displayCaseName);
  });
  const ignored = await page.evaluate(() => window.__appShell.$refs.activeView.records.length);
  if (ignored !== 3) throw new Error('复盘期间事件不应生成成绩');
  await page.getByRole('button', { name: '返回训练' }).click();
  const returned = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { replay: view.replayRecord, current: view.training.current,
      facelets: view.world.cube.serialize(), count: view.records.length, startedAt: view.training.startedAt };
  });
  if (returned.replay || returned.current.scramble !== afterCorrect.current.scramble ||
    returned.facelets !== afterCorrect.facelets || returned.count !== 3 || returned.startedAt !== null)
    throw new Error('返回训练未恢复当前题');
  const bleResult = await page.evaluate(() => {
    const shell = window.__appShell, view = shell.$refs.activeView;
    const caseScramble = view.training.current.scramble;
    shell.dispatch({ type: 'facelets', facelets: 'RUUUUUUUURRRRRRRRUFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', serial: 0 });
    shell.dispatch({ type: 'move', move: 'R', serial: 101 });
    shell.dispatch({ type: 'facelets', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', serial: 0 });
    return { result: view.records[0], count: view.records.length, caseScramble };
  });
  if (bleResult.count !== 4 || bleResult.result.kind !== 'bluetooth' ||
    bleResult.result.scramble !== bleResult.caseScramble || bleResult.result.durationMs < 0)
    throw new Error(`蓝牙速度或案例状态记录异常 ${JSON.stringify(bleResult)}`);
  await page.getByRole('combobox', { name: 'PLL 筛选' }).selectOption('all');
  await page.getByRole('combobox', { name: '结果筛选' }).selectOption('bluetooth');
  const bluetoothFiltered = await page.evaluate(() => window.__appShell.$refs.activeView.filteredRecords);
  if (bluetoothFiltered.length !== 1 || bluetoothFiltered[0].kind !== 'bluetooth') throw new Error('蓝牙记录筛选异常');
  await page.reload();
  if (await page.evaluate(() => window.__appShell.$refs.activeView.records.length) !== 4) throw new Error('记录持久化异常');
  await page.setViewportSize({ width: 360, height: 740 });
  await checkbox.check();
  const mobile = await page.evaluate(() => ({ horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    cube: document.querySelector('.pll6-cube canvas').getBoundingClientRect().height }));
  if (mobile.horizontal || mobile.cube < 200) throw new Error(`移动端布局异常 ${JSON.stringify(mobile)}`);
  console.log('PLL 特征提示、错误/正确记录、筛选、复盘与返回训练验证通过');
}
