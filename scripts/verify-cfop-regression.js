async page => {
  const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  await page.goto(`http://127.0.0.1:18084/?mode=cfop&test=${Date.now()}`);
  await page.waitForSelector('.cfop-panel');
  await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    vm.route = {input:'', moves:['R'], frames:[], segments:[]};
    vm.options = [{moves:['R']}];
    vm.follow = {status:'paused'};
    vm.cursor = 1;
  });
  await page.getByRole('button', {name:'随机打乱'}).click();
  const scramble = await page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    if (!/^(?:[URFDLB](?:2|')?)(?: [URFDLB](?:2|')?){26}$/.test(vm.input))
      throw new Error(`打乱公式无效：${vm.input}`);
    if (vm.route || vm.options.length || vm.follow || vm.cursor !== 0 || vm.playing)
      throw new Error('打乱后残留上一轮解法或跟练状态');
    const frames = await vm.client.timeline(vm.input, []);
    if (vm.world.cube.serialize() !== frames[0].facelets)
      throw new Error('3D 魔方与新打乱状态不一致');
    return vm.input;
  });
  const rotations = await page.evaluate(async solved => {
    const vm = window.__appShell.currentView();
    const moves = ['y', "y'"];
    const frames = await vm.client.timeline(solved, moves);
    vm.route = {input:solved, moves, frames, segments:[]};
    vm.follow = null;
    vm.seek(0);
    const begin = vm.world.scene.rotation.y;
    const forward = vm.next();
    if (vm.world.scene.rotation.y !== begin || vm.cursor !== 0)
      throw new Error('y 应在下一帧开始动画，不能立即跳转');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const middle = vm.world.scene.rotation.y;
    if (!(middle > begin && middle < begin + Math.PI / 2) || vm.cursor !== 0)
      throw new Error(`y 没有中间动画帧：${begin} → ${middle}`);
    await forward;
    if (vm.cursor !== 1 || Math.abs(vm.world.scene.rotation.y - begin - Math.PI / 2) > 1e-6)
      throw new Error('y 动画完成状态不正确');
    await vm.next();
    if (vm.cursor !== 2 || Math.abs(vm.world.scene.rotation.y - begin) > 1e-6)
      throw new Error("y' 动画完成后未恢复初始朝向");
    vm.seek(0);
    const cancelled = vm.next();
    vm.seek(0);
    await cancelled;
    if (vm.cursor !== 0 || Math.abs(vm.world.scene.rotation.y - begin) > 1e-6)
      throw new Error('取消视角动画后朝向或光标残留');
    vm.togglePlay();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    vm.togglePlay();
    if (vm.cursor !== 0 || Math.abs(vm.world.scene.rotation.y - begin) > 1e-6)
      throw new Error('暂停 y 动画后应回到当前光标对应的朝向');
    await new Promise(resolve => requestAnimationFrame(resolve));
    await vm.next();
    if (vm.cursor !== 1 || Math.abs(vm.world.scene.rotation.y - begin - Math.PI / 2) > 1e-6)
      throw new Error('暂停后重播 y 转过了多于四分之一圈');
    vm.seek(0);
    return {begin, middle, completed:vm.cursor};
  }, solved);
  const starts = {};
  for (const mode of ['XCROSS', 'XXCROSS', 'XXXCROSS']) {
    starts[mode] = await page.evaluate(async ({mode, solved}) => {
      const vm = window.__appShell.currentView();
      vm.input = solved;
      vm.mode = mode;
      vm.startDepth = 0;
      await vm.searchStart();
      if (!vm.options.length) throw new Error(`${mode} 没有已完成状态候选：${vm.error}`);
      await vm.choose(vm.options[0]);
      if (!vm.route) throw new Error(`${mode} 未生成路线：${vm.error}`);
      return vm.route.segments.map(segment => segment.label);
    }, {mode, solved});
    const expected = {XCROSS:1, XXCROSS:2, XXXCROSS:3}[mode];
    if (starts[mode].filter(label => /首阶段已完成/.test(label)).length < expected)
      throw new Error(`${mode} 分组异常：${starts[mode]}`);
  }

  const mapped = await page.evaluate(async solved => {
    const vm = window.__appShell.currentView();
    const cases = [
      ['y', 'F', "y'", "S", "S'"],
      ["y'", 'R', 'F2', 'y', 'U2'],
      ['y', 'y', 'F', 'R', 'S'],
      ["y'", "y'", 'B', 'L', "S'"],
    ];
    const results = [];
    for (const moves of cases) {
      const frames = await vm.client.timeline(solved, moves);
      vm.stages = [{target:'Cross', moves}];
      vm.route = {input:solved, moves, frames, segments:[]};
      vm.follow = null;
      vm.seek(0);
      for (let i = 0; i < moves.length; i++) {
        await vm.next();
        if (vm.cursor !== i + 1 || vm.world.cube.serialize() !== frames[i + 1].facelets)
          throw new Error(`${moves.join(' ')} @${i}: ${vm.error || '状态不一致'}`);
      }
      results.push(moves.join(' '));
    }
    return results;
  }, solved);

  const lifecycle = await page.evaluate(async solved => {
    const vm = window.__appShell.currentView();
    const moves = ['R'];
    const frames = await vm.client.timeline(solved, moves);
    vm.route = {input:solved, moves, frames, segments:[]};
    vm.seek(0);
    const next = vm.next();
    const pending = vm.world.callbacks.length;
    vm.seek(0);
    await next;
    if (vm.world.callbacks.length !== 0 || vm.cursor !== 0 || vm.error)
      throw new Error(`动画取消残留：callbacks=${vm.world.callbacks.length}, cursor=${vm.cursor}, error=${vm.error}`);
    return {pending, remaining:vm.world.callbacks.length};
  }, solved);
  const physical = await page.evaluate(async () => {
    const shell = window.__appShell;
    await shell.connect('mock');
    const vm = shell.currentView();
    const request = shell.session.requestFacelets;
    shell.session.requestFacelets = () => Promise.resolve();
    try {
      const pending = vm.readPhysicalStart();
      vm.handlePhysicalEvent({type:'move', move:'R', serial:100});
      await pending;
      if (!/转动/.test(vm.error)) throw new Error(`移动中读快照未中止：${vm.error}`);
      const stale = vm.readPhysicalStart();
      vm.onSessionSnapshot({...shell.session.snapshot, status:'disconnected'});
      await stale;
      if (!/连接已变化/.test(vm.error)) throw new Error(`断连未中止读取：${vm.error}`);
      return '转动与断连均中止在途读取';
    } finally {
      shell.session.requestFacelets = request;
    }
  });
  return {scramble, rotations, starts, mapped, lifecycle, physical};
}
