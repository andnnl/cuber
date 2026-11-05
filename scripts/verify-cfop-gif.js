async page => {
  await page.goto(`${page.url().split('?')[0]}?mode=cfop`);
  await page.waitForSelector('.cfop-panel');
  await page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const moves = ['R', 'y', "F'"];
    const frames = await vm.client.timeline(solved, moves);
    vm.route = {input:solved, moves, frames, segments:[]};
    vm.seek(0);
    vm.speed = 400;
  });
  const placement = await page.getByRole('button', {name:'生成 GIF', exact:true}).evaluate(button =>
    button.previousElementSibling.textContent.trim());
  if (placement !== '播放') throw new Error('生成 GIF 按钮不在播放右侧');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {name:'生成 GIF', exact:true}).click();
  await page.getByRole('button', {name:'生成中…', exact:true}).waitFor();
  const download = await downloadPromise;
  await download.saveAs('/tmp/cfop-gif-verified.gif');
  await page.waitForFunction(() => !window.__appShell.currentView().gifRecording);
  const result = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    return {cursor:vm.cursor, moves:vm.route.moves.length, error:vm.error,
      capture:vm.gifCapture, playing:vm.playing,
      matches:vm.world.cube.serialize() === vm.route.frames[vm.cursor].facelets};
  });
  if (result.error || result.capture || result.playing || !result.matches || result.cursor !== result.moves)
    throw new Error(`GIF 导出结束状态异常：${JSON.stringify(result)}`);
  if (!/^cfop-.*\.gif$/.test(download.suggestedFilename())) throw new Error('GIF 文件名不正确');
  const cancelled = await page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    const exporting = vm.generateGif();
    vm.seek(0);
    await exporting;
    return !vm.gifRecording && !vm.gifCapture && !vm.playing && vm.cursor === 0;
  });
  if (!cancelled) throw new Error('返回起点没有取消 GIF 录制');
  return {filename:download.suggestedFilename(), result, cancelled};
}
