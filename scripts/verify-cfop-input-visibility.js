async page => {
  await page.goto(`http://127.0.0.1:18085/?mode=cfop&test=${Date.now()}`);
  await page.waitForSelector('.cfop-panel');
  const input = page.locator('input[aria-label="打乱公式或 54 位面贴纸"]');
  await input.fill('R U2');
  await page.getByRole('button', {name:'按公式打乱'}).click();
  const result = await page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    const applied = vm.world.cube.serialize();
    vm.world.cube.twister.setup('R U2');
    if (applied !== vm.world.cube.serialize() || !vm.status.includes('按公式打乱'))
      throw new Error('输入公式未应用到 3D');
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const moves = ['R', 'U'];
    const frames = await vm.client.timeline(solved, moves);
    vm.route = {input:solved, moves, frames, segments:[
      {label:'十字', start:0, end:1, moves:['R']},
      {label:'第 1 组 F2L · FR', slot:'FR', start:1, end:2, moves:['U']},
      {label:'第 2 组 F2L · FL', slot:'FL', start:2, end:2, moves:[]},
    ]};
    vm.seek(0);
    return {applied, frames:frames.length};
  });
  await page.getByLabel('半透明').check();
  await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    if (vm.world.cube.cubelets[20].frame.visible) throw new Error('半透明仍显示骨架');
    if (!vm.world.cube.cubelets[20].stickers.some(s => s && s.material.opacity === 0.18))
      throw new Error('无关角块没有半透明');
    if (!vm.world.cube.cubelets[19].stickers.some(s => s && s.material.type === 'MeshBasicMaterial'))
      throw new Error('十字棱块没有保留');
  });
  await page.getByLabel('隐藏无关').check();
  await page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    if (!vm.world.cube.cubelets[20].stickers.some(s => s && s.material.opacity === 0.1))
      throw new Error('无关角块没有隐藏');
    await vm.next();
    if (vm.cursor !== 1) throw new Error(`十字逐步播放失败：${vm.error}`);
    if (!vm.world.cube.cubelets[26].stickers.some(s => s && s.material.type === 'MeshBasicMaterial'))
      throw new Error('当前 F2L 角块被隐藏');
    vm.seek(0);
    vm.seek(1);
    if (!vm.world.cube.cubelets[26].stickers.some(s => s && s.material.type === 'MeshBasicMaterial'))
      throw new Error('跳步后 F2L 目标没有刷新');
  });
  await page.getByLabel('隐藏无关').uncheck();
  await page.getByLabel('半透明').uncheck();
  await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    if (vm.world.cube.cubelets.some(piece => piece && piece.exist &&
      piece.stickers.some(sticker => sticker && sticker.visible && sticker.material.transparent)))
      throw new Error('关闭模式后贴纸未恢复');
  });
  const beforeInvalid = await page.evaluate(() => window.__appShell.currentView().world.cube.serialize());
  await input.fill('R Q');
  await page.getByRole('button', {name:'按公式打乱'}).click();
  if (!await page.getByRole('alert').isVisible()) throw new Error('无效公式没有错误提示');
  if (await page.evaluate(() => window.__appShell.currentView().world.cube.serialize()) !== beforeInvalid)
    throw new Error('无效公式改动了 3D 魔方');
  await input.fill('R z2');
  await page.getByRole('button', {name:'按公式打乱'}).click();
  await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    if (!vm.input.endsWith(' z2') || !vm.status.includes('按公式打乱'))
      throw new Error('末尾 z2 输入未应用');
  });
  const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  await input.fill(solved);
  await page.getByRole('button', {name:'按公式打乱'}).click();
  if (await page.evaluate(() => window.__appShell.currentView().world.cube.serialize()) !== solved)
    throw new Error('54 位状态未应用到 3D');
  return `3D 公式应用、十字/F2L 目标、半透明/隐藏切换、恢复、错误提示正常（${result.frames} 帧）`;
}
