async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${page.url().split('?')[0]}?mode=formulatimer`);
  await page.locator('.formula-timer-root').waitFor();
  await page.evaluate(async () => { await window.__appShell.disconnect(); });
  const prepare = async scramble => page.evaluate(scramble => {
    const vm = window.__appShell.currentView();
    vm.clearNextJob();
    vm.settings.preload = false;
    vm.showCase({ id:'pll:slice-test', category:'pll', name:'切层测试', formula:'M S E', scramble });
    return vm.records.length;
  }, scramble);
  const keys = page.locator('[aria-label="可操作的训练魔方"]');
  for (const axis of ['M', 'S', 'E']) {
    for (const inverse of [false, true]) {
      const count = await prepare(axis + (inverse ? '' : "'"));
      await keys.focus();
      await page.keyboard.press((inverse ? 'Shift+' : '') + axis.toLowerCase());
      await page.waitForFunction(count => window.__appShell.currentView().records.length > count, count);
      const result = await page.evaluate(() => {
        const vm = window.__appShell.currentView();
        return { record:vm.records[0], matches:vm.world.cube.serialize() === vm.displayCube.serialize() };
      });
      assert(result.record.result === 'success' && result.record.moveCount === 1 && result.matches,
        `${axis}${inverse ? "'" : ''} 键盘操作丢步或重复计步`);
    }
  }
  const gapRecordCount = await prepare('F U R');
  const gap = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const simulator = new vm.displayCube.constructor(3);
    const sequence = ['R', 'R', "L'", "L'"];
    simulator.twister.setup(sequence.join(' '));
    const physical = simulator.serialize();
    simulator.twister.setup('F U R ' + sequence.join(' '));
    const expected = simulator.serialize();
    vm.recovery.start(solved, 40);
    for (let index = 1; index < sequence.length; index++)
      vm.handlePhysicalEvent({type:'move', move:sequence[index], serial:41 + index}, true);
    vm.awaitingState = true;
    vm.handlePhysicalEvent({type:'facelets', facelets:physical, serial:44}, false);
    vm.world.cube.twister.finish();
    vm.clearVerification(false);
    return { expected, logical:vm.displayCube.serialize(), rendered:vm.world.cube.serialize(),
      unscored:vm.unscoredRound, recordCount:vm.records.length };
  });
  assert(gap.logical === gap.expected && gap.rendered === gap.expected, 'M2 单包丢失后逻辑或画面未恢复');
  assert(gap.unscored && gap.recordCount === gapRecordCount, '缺少首步时间的 M2 被计为有效成绩');

  await prepare('F U R');
  const prefix = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    const simulator = new vm.displayCube.constructor(3);
    simulator.twister.setup("F U R R L' F B' U");
    const expected = simulator.serialize();
    vm.recovery.start(solved, 40);
    for (const [move, serial, recovered] of [['F',43,false], ['U',45,false], ['R',41,true], ["L'",42,true], ["B'",44,true]])
      vm.handlePhysicalEvent({type:'move', move, serial, recovered}, true);
    vm.world.cube.twister.finish();
    vm.clearVerification(false);
    return { expected, logical:vm.displayCube.serialize(), rendered:vm.world.cube.serialize(), unscored:vm.unscoredRound };
  });
  assert(prefix.logical === prefix.expected && prefix.rendered === prefix.expected,
    '多个缺口逐段恢复时仍漏播已确认前缀');
  assert(prefix.unscored, '历史恢复没有标记不计分');

  await prepare('F U R');
  const request = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    const solved = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    window.__sliceOriginalRequest = vm.session.requestFacelets;
    window.__sliceRequests = 0;
    vm.session.requestFacelets = () => { window.__sliceRequests++; return Promise.resolve(); };
    vm.recovery.start(solved, 0);
    for (const [index, move] of ['R', "L'", "R'"].entries())
      vm.handlePhysicalEvent({type:'move', move, serial:41 + index}, true);
    return vm.verifyRequest;
  });
  await page.waitForFunction(request => window.__appShell.currentView().verifyRequest > request, request);
  const candidate = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    const before = vm.displayCube.serialize();
    vm.handlePhysicalEvent({type:'facelets', facelets:'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', serial:0}, false);
    return { unchanged:before === vm.displayCube.serialize(), request:vm.verifyRequest };
  });
  assert(candidate.unchanged, '首个重复状态帧未经独立确认就改变了画面');
  await page.waitForFunction(request => window.__appShell.currentView().verifyRequest > request, candidate.request);
  const confirmed = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    vm.handlePhysicalEvent({type:'facelets', facelets:'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', serial:0}, false);
    vm.world.cube.twister.finish();
    const simulator = new vm.displayCube.constructor(3);
    simulator.twister.setup('F U R');
    const result = { expected:simulator.serialize(), logical:vm.displayCube.serialize(),
      rendered:vm.world.cube.serialize(), unscored:vm.unscoredRound, requests:window.__sliceRequests };
    vm.clearVerification(false);
    vm.session.requestFacelets = window.__sliceOriginalRequest;
    delete window.__sliceOriginalRequest;
    delete window.__sliceRequests;
    vm.resetCase();
    return result;
  });
  assert(confirmed.logical === confirmed.expected && confirmed.rendered === confirmed.expected,
    '真实回到旧状态经二次确认后仍未补回末侧动作');
  assert(confirmed.unscored && confirmed.requests === 2, '状态核验次数或成绩有效性错误');
  assert(errors.length === 0, `页面错误：${errors.join('; ')}`);
  console.log(JSON.stringify({keyboardCases:6, M2Recovery:gap, prefixRecovery:prefix, confirmedState:confirmed, errors}));
}
