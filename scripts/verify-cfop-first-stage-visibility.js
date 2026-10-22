async page => {
  await page.goto(`http://127.0.0.1:18085/?mode=cfop&firstStage=${Date.now()}`);
  await page.waitForSelector('.cfop-panel');
  const result = await page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const moves = ['R','U'];
    const frames = await vm.client.timeline(solved, moves);
    const pairs = {FR:[20,23], FL:[18,21], BL:[0,3], BR:[2,5]};
    const check = (slots, ghost) => {
      vm.route = {input:solved, moves, frames:frames.map((frame,i) => ({...frame,
        slots:i === 2 ? slots : [],
      })), segments:[{label:'十字',start:0,end:2,moves}, ...slots.map(slot =>
        ({label:slot,slot,start:2,end:2,moves:[]}))]};
      vm.ghost = ghost;
      vm.hideUnrelated = !ghost;
      vm.seek(0);
      const bright = vm.world.cube.cubelets.filter(piece => piece && piece.exist &&
        piece.stickers.some(sticker => sticker && sticker.material.type === 'MeshBasicMaterial'));
      if (bright.length !== 4 + 2 * slots.length)
        throw new Error(`${slots.join(',') || 'Cross'} ${ghost ? '半透明' : '隐藏'}：目标数 ${bright.length}`);
      for (const slot of slots) for (const index of pairs[slot]) {
        if (!vm.world.cube.cubelets[index].stickers.some(sticker => sticker &&
          sticker.material.type === 'MeshBasicMaterial'))
          throw new Error(`${slot} 角棱块在首阶段被隐藏：${index}`);
      }
      if (slots.length < 4 && vm.world.cube.cubelets[pairs.BR[0]].stickers.some(sticker => sticker &&
        sticker.material.type === 'MeshBasicMaterial'))
        throw new Error('非目标 BR 角块未淡化');
    };
    check([], false);
    check(['FR'], false);
    check(['FR','FL'], false);
    check(['FR','FL','BL'], false);
    check(['FR','FL','BL'], true);
    vm.seek(1);
    if (vm.world.cube.cubelets.filter(piece => piece && piece.exist &&
      piece.stickers.some(sticker => sticker && sticker.material.type === 'MeshBasicMaterial')).length !== 10)
      throw new Error('十字阶段跳步后 XXXCross 角棱未继续保留');
    check(['FR'], false);
    await vm.next();
    if (vm.cursor !== 1 || vm.world.cube.cubelets.filter(piece => piece && piece.exist &&
      piece.stickers.some(sticker => sticker && sticker.material.type === 'MeshBasicMaterial')).length !== 6)
      throw new Error(`十字动画后 XCross 角棱未继续保留：${vm.error}`);
    return 'Cross/XCross/XXCross/XXXCross 首阶段角棱显示正确';
  });
  return result;
}
