async page => {
  await page.goto('http://127.0.0.1:18083/?mode=blecross');
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
  await page.evaluate(() => {
    localStorage.setItem('bleCompactMode', '0');
    window.__bleCross.compactMode = false;
  });

  for (const [mode, slots] of [
    ['xcross', ['FR', 'FL']],
    ['xxcross', ['FR+FL', 'FR+BL']],
    ['xxxcross', ['FR+FL+BL', 'FR+FL+BR']],
  ]) {
    await page.evaluate(({mode, slots}) => {
      const vm = window.__bleCross;
      vm.trainMode = mode;
      vm.showBest = true;
      vm.phase = 'observing';
      vm.isManual = true;
      vm.bestBaseState = vm.world.cube.serialize();
      vm.bestViewOps = [];
      vm.bestXReady = true;
      vm.bestX = slots.map((slot, i) => ({slot, formula: i ? 'R' : 'U', steps: 1, available: true}));
    }, {mode, slots});
    const rows = page.locator('[data-ble-bestx-row]');
    if (await rows.count() !== 2) throw Error(`${mode} 未显示两行解法`);
    const gifButtons = page.locator('[data-ble-solution-panel] button').filter({hasText: /^GIF$/});
    if (await gifButtons.count() !== await rows.count())
      throw Error(`${mode} GIF 按钮应与解法行一一对应，实际 ${await gifButtons.count()} 个按钮、${await rows.count()} 行`);
    for (let i = 0; i < 2; i++) {
      const buttons = await rows.nth(i).locator('[data-ble-preview-controls] button').allTextContents();
      if (buttons.at(-1) !== 'GIF' || buttons.at(-2) !== '▶')
        throw Error(`${mode} 第 ${i + 1} 行 GIF 未紧跟播放按钮：${buttons}`);
    }
  }
  await page.evaluate(() => {
    window.__bleCross.trainMode = 'cross';
    window.__bleCross.bestReady = true;
  });
  if (await page.locator('[data-ble-solution-panel] button').filter({hasText: /^GIF$/}).count() !== 1)
    throw Error('Cross 单组原有 GIF 按钮不应被移除');
  await page.evaluate(() => { window.__bleCross.trainMode = 'xxxcross'; });
  const rows = page.locator('[data-ble-bestx-row]');
  const downloadPromise = page.waitForEvent('download', {timeout: 30000});
  await rows.nth(1).getByRole('button', {name: 'GIF'}).click();
  const result = await page.evaluate(() => {
    const vm = window.__bleCross;
    return {recording: vm.gifRecording, target: vm.bestXGifFormula, playing: vm.bestPlayFormula};
  });
  if (!result.recording || result.target !== 'R' || result.playing !== 'R')
    throw Error(`逐行 GIF 未播放所点的第二行：${JSON.stringify(result)}`);
  const download = await downloadPromise;
  if (!download.suggestedFilename().endsWith('.gif')) throw Error('未下载 GIF 文件');
  await page.waitForFunction(() => !window.__bleCross.gifRecording, null, {timeout: 30000});
  return 'XCross／XXCross／XXXCross 逐行 GIF 按钮与第二行录制：通过';
}
