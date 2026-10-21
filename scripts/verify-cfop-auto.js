async page => {
  await page.goto(`${page.url().split('?')[0]}?mode=cfop&test=${Date.now()}`);
  await page.waitForSelector('.cfop-panel');
  const result = await page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    const calls = [];
    vm.client.search = async operation => {
      calls.push(operation);
      if (operation === 'start') return [{target:'Cross', moves:['R']}, {target:'Cross', moves:['L']}];
      if (operation === 'full') return [{moves:['U']}, {moves:['D']}];
      throw new Error(`意外调用 ${operation}`);
    };
    const until = async predicate => {
      for (let i = 0; i < 150; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`自动流程超时：${JSON.stringify({calls, stages:vm.stages, error:vm.error})}`);
    };
    vm.autoCross = true;
    vm.autoF2l = true;
    vm.saveAutoOptions();
    vm.newScramble();
    await until(() => vm.stages.length === 2 && vm.route?.moves.length === 2);
    if (calls.join(',') !== 'start,full' || vm.route.moves.join(' ') !== 'R U' || vm.cursor !== 0 || vm.playing)
      throw new Error(`双自动未选首个结果并停在起点：${JSON.stringify({calls, stages:vm.stages, cursor:vm.cursor, error:vm.error})}`);
    vm.autoCross = false;
    vm.autoF2l = true;
    vm.saveAutoOptions();
    calls.length = 0;
    vm.newScramble();
    await new Promise(resolve => setTimeout(resolve, 30));
    if (calls.length || vm.stages.length) throw new Error('仅自动 F2L 时不应抢先搜索首阶段');
    await vm.searchStart();
    await vm.choose(vm.options[0]);
    await until(() => vm.stages.length === 2 && vm.route?.moves.length === 2);
    if (calls.join(',') !== 'start,full') throw new Error(`手动选十字后未自动 F2L：${calls}`);
    vm.autoCross = true;
    vm.autoF2l = false;
    const pending = [];
    vm.client.search = () => new Promise(resolve => pending.push(resolve));
    vm.newScramble();
    vm.newScramble();
    if (pending.length !== 2) throw new Error(`新打乱没有重新请求：${pending.length}`);
    pending[0]([{moves:['R']}]);
    await new Promise(resolve => setTimeout(resolve, 30));
    if (vm.stages.length || vm.options.length) throw new Error('旧轮次候选污染新打乱');
    pending[1]([{moves:['L']}]);
    await until(() => vm.stages.length === 1 && vm.route?.moves.join(' ') === 'L');
    vm.autoCross = false;
    vm.autoF2l = true;
    vm.saveAutoOptions();
    return {calls, moves:vm.route.moves, cursor:vm.cursor};
  });
  await page.reload();
  const remembered = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    return [vm.autoCross, vm.autoF2l];
  });
  if (remembered.join(',') !== 'false,true') throw new Error(`自动选项未记忆：${remembered}`);
  return {result, remembered};
}
