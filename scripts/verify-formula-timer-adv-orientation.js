async page => {
  const expect = (condition, message) => { if (!condition) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = page.url().split('/').slice(0, 3).join('/');
  await page.goto(`${origin}/?mode=formulatimer&orientation-check=${Date.now()}`);
  await page.locator('.formula-timer-root').waitFor();
  const samples = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    return ['advf2l:3534:0:4069', 'advf2l:3534:0:4213', 'advf2l:3534:2:26357', 'advf2l:3534:3:10893',
      vm.items.find(item => item.category === 'advf2l' && item.formula.includes('y2')).id];
  });
  let checked = 0;
  for (const layout of ['alternate', 'fixed-left']) {
    for (const [flipped, yaw, expected] of [[false, '', 'URFDLB'], [true, 'y', 'DBLUFR']]) {
      for (const id of samples) {
        const state = await page.evaluate(async ({ id, layout, flipped, yaw }) => {
          const vm = window.__appShell.currentView();
          vm.clearNextJob();
          vm.focusIds = null;
          vm.settings.category = 'advf2l';
          vm.settings.selectedIds.advf2l = [id];
          vm.settings.slowOnly = false;
          vm.settings.preload = true;
          vm.settings.preloadLayout = layout;
          vm.settings.nextMode = 'random';
          vm.settings.beforeZ2 = flipped;
          vm.settings.beforeY = yaw;
          vm.settings.hideUnrelated = true;
          vm.queuedCase = null;
          vm.nextCase();
          await vm.$nextTick();
          const centers = state => [4,13,22,31,40,49].map(index => state[index]).join('');
          return { id:vm.current.id, current:centers(vm.current.initialFacelets),
            next:centers(vm.queuedCase.initialFacelets), display:centers(vm.displayCube.serialize()),
            preview:vm.nextCube.facelets, queued:vm.queuedCase.initialFacelets,
            formula:vm.current.formula, original:vm.items.find(item => item.id === id).formula };
        }, { id, layout, flipped, yaw });
        expect(state.id === id && state.current === expected && state.next === expected && state.display === expected,
          `${id}/${layout}/${flipped}/${yaw} 当前题和下一题应保持统一朝向：${JSON.stringify(state)}`);
        expect(state.preview === state.queued && state.formula === state.original, '预览应使用实际题面，原训练公式保持不变');
        const promoted = await page.evaluate(async () => {
          const vm = window.__appShell.currentView();
          const queued = vm.queuedCase.initialFacelets;
          const advanced = vm.advanceQueuedCase();
          await vm.$nextTick();
          return advanced && vm.current.initialFacelets === queued;
        });
        expect(promoted, '下一题接替当前题时不得重新改变朝向');
        checked++;
      }
    }
  }
  expect(errors.length === 0, `页面异常：${errors.join('; ')}`);
  return { checked, variants:['原朝向', 'y', "y'", 'y2', '切层及双层转动'], preloadLayouts:['alternate','fixed-left'], errors };
}
