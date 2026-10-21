async page => {
  await page.goto(`http://127.0.0.1:18085/?mode=cfop&test=${Date.now()}`);
  await page.waitForSelector('.cfop-panel');
  return page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const moves = ['R', 'y', 'U', 'F', 'L', 'D'];
    const frames = await vm.client.timeline(solved, moves);
    vm.route = {input:solved, moves, frames, segments:[
      {label:'十字', start:0, end:0, moves:[]},
      {label:'第 1 组 F2L · FR', slot:'FR', start:0, end:2, moves:moves.slice(0,2)},
      {label:'第 2 组 F2L · FL', slot:'FL', start:2, end:4, moves:moves.slice(2,4)},
      {label:'第 3 组 F2L · BL', slot:'BL', start:4, end:5, moves:moves.slice(4,5)},
      {label:'第 4 组 F2L · BR', slot:'BR', start:5, end:6, moves:moves.slice(5)},
    ]};
    vm.follow = null;
    const colorOf = (piece, color) => piece.children.some(node => node.type === 'Group' &&
      node.children.some(child => child.material && child.material.color && child.material.color.getHex() === color));
    const check = (piece, color, message) => {
      if (!colorOf(piece, color)) throw new Error(message);
    };
    vm.seek(0);
    const corner = vm.world.cube.cubelets[20];
    const edge = vm.world.cube.cubelets[23];
    const nextCorner = vm.world.cube.cubelets[18];
    const nextEdge = vm.world.cube.cubelets[21];
    check(corner, 0x9c27b0, 'FR 角块缺少紫色追踪');
    check(edge, 0x9c27b0, 'FR 棱块缺少紫色追踪');
    check(nextCorner, 0x00bcd4, 'FL 角块缺少青色预告');
    check(nextEdge, 0x00bcd4, 'FL 棱块缺少青色预告');
    await vm.next();
    if (vm.cursor !== 1 || vm.world.cube.cubelets.indexOf(corner) === 20)
      throw new Error(`R 动画未推动追踪块：${vm.error}`);
    check(corner, 0x9c27b0, 'R 转动后高亮未跟随 FR 角块');
    check(edge, 0x9c27b0, 'R 转动后高亮未跟随 FR 棱块');
    await vm.next();
    if (vm.cursor !== 2 || vm.tracking.current !== 'FL') throw new Error('y 视角转动后未切换 F2L 组');
    check(nextCorner, 0x00bcd4, '第 2 组从下一组变当前组时不应换色');
    check(nextEdge, 0x00bcd4, '第 2 组棱块从下一组变当前组时不应换色');
    await vm.$nextTick();
    if (getComputedStyle(document.querySelector('.cfop-tracking span i')).backgroundColor !== 'rgb(0, 188, 212)')
      throw new Error('第 2 组文字标记未跟随青色');
    vm.seek(0);
    check(vm.world.cube.cubelets[20], 0x9c27b0, '回到起点未重新定位 FR');
    vm.seek(4);
    if (vm.tracking.current !== 'BL' || vm.tracking.next !== 'BR' ||
      vm.world.cube.initials.filter(piece => colorOf(piece, 0x9c27b0)).length !== 2 ||
      vm.world.cube.initials.filter(piece => colorOf(piece, 0x00bcd4)).length !== 2)
      throw new Error('第 3／4 组没有按紫／青交替');
    vm.seek(5);
    if (vm.tracking.current !== 'BR' || vm.tracking.next ||
      vm.world.cube.initials.filter(piece => colorOf(piece, 0x00bcd4)).length !== 2)
      throw new Error('第 4 组成为当前组后应保持青色');
    vm.seek(6);
    if (vm.tracking.current || vm.tracking.next ||
      vm.world.cube.initials.some(piece => colorOf(piece, 0x9c27b0) || colorOf(piece, 0x00bcd4)))
      throw new Error('播放完成后追踪未清除');
    vm.route.segments = [
      {label:'十字', start:0, end:0, moves:[]},
      {label:'第 1 组 F2L · FR（首阶段已完成）', slot:'FR', start:0, end:0, moves:[]},
      {label:'第 2 组 F2L · FL', slot:'FL', start:0, end:2, moves:moves.slice(0,2)},
      {label:'第 3 组 F2L · BL', slot:'BL', start:2, end:4, moves:moves.slice(2,4)},
    ];
    vm.seek(0);
    check(vm.world.cube.cubelets[18], 0x00bcd4, '首阶段已有第 1 组时，第 2 组仍应为青色');
    return '四组固定交替、首阶段预完成、动画跟随、y 切换、跳步与清理正常';
  });
}
