async page => {
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  await page.goto('http://127.0.0.1:18098/?mode=pll6');
  await page.locator('.pll6-root').waitFor();
  await page.getByRole('checkbox', {name:'显示当前特征'}).check();
  const results = [];
  for (const width of [360,390,1280]) {
    await page.setViewportSize({width,height:844});
    const result = await page.evaluate(async () => {
      const vm = window.__appShell.currentView();
      const failures = [];
      let checked = 0, crowded = 0;
      for (const mode of ['equality','legacy']) {
        vm.observationMode = mode;
        for (const choice of vm.choices) for (const auf of ['', 'U', 'U2', "U'"]) {
          vm.world.cube.twister.setup([vm.training.invert(choice.origin),auf].filter(Boolean).join(' '));
          vm.refreshActualFeature();
          await vm.$nextTick();
          const layer = document.querySelector('.pll6-visual-overlay');
          if (!layer) { failures.push(`${mode} ${choice.name} ${auf}: missing overlay`); continue; }
          const boxes = [...layer.querySelectorAll('text')].map(text => ({text:text.textContent,box:text.getBBox()}));
          const view = layer.viewBox.baseVal;
          if (vm.visualEdges.length >= 3) crowded++;
          for (let index = 0; index < boxes.length; index++) {
            const {box,text} = boxes[index];
            if (box.x < 0 || box.y < 0 || box.x + box.width > view.width || box.y + box.height > view.height)
              failures.push(`${mode} ${choice.name} ${auf}: clipped ${text}`);
            for (const previous of boxes.slice(0,index)) {
              const other = previous.box;
              if (box.x < other.x + other.width + 3 && box.x + box.width + 3 > other.x &&
                box.y < other.y + other.height + 3 && box.y + box.height + 3 > other.y)
                failures.push(`${mode} ${choice.name} ${auf}: overlap ${text}/${previous.text}`);
            }
            const label = [...layer.querySelectorAll('text')][index].closest('.pll6-visual-label');
            if (!label?.querySelector('rect')) failures.push(`${mode} ${choice.name} ${auf}: missing label geometry`);
          }
          const paths = [...layer.querySelectorAll('.pll6-visual-edge > path')];
          const labels = [...layer.querySelectorAll('.pll6-visual-label')];
          if (paths.some(path => labels.some(label => !(path.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING))))
            failures.push(`${mode} ${choice.name} ${auf}: path painted over labels`);
          checked++;
        }
      }
      vm.loadCase();
      vm.observationMode = 'equality';
      return {checked,crowded,failures:failures.slice(0,12),failureCount:failures.length};
    });
    results.push({width,...result});
  }
  assert(results.every(result => result.failureCount === 0), JSON.stringify(results));
  assert(results.every(result => result.crowded > 0), '没有覆盖三条线以上案例');
  const layer = page.locator('.pll6-visual-overlay');
  assert(await layer.evaluate(element => getComputedStyle(element).pointerEvents) === 'none', '遮挡了魔方操作');
  return results;
}
