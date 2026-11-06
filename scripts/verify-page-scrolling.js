async page => {
  const failures = [];
  const results = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const navigate = async mode => {
    await page.goto(`${page.url().split('?')[0]}?mode=${mode}&scrollcheck=${Date.now()}`);
    await page.locator('[data-app-shell] > .v-application').waitFor();
  };
  for (const viewport of [{width:1280,height:820}, {width:390,height:700}, {width:1024,height:500}, {width:844,height:390}, {width:320,height:568}]) {
    await page.setViewportSize(viewport);
    for (const mode of ['advf2l','bleconnect','director','algs','f2l']) {
      await navigate(mode);
      const root = page.locator(mode === 'advf2l' ? '.adv-f2l-root' : mode === 'bleconnect' ? '.ble-connect-page' : '.v-application--wrap > div').first();
      const layout = await root.evaluate(element => ({
        height:element.clientHeight, content:element.scrollHeight,
        overflow:getComputedStyle(element).overflowY,
        scrollbar:getComputedStyle(element, '::-webkit-scrollbar').width
      }));
      check(['auto','scroll'].includes(layout.overflow) && layout.height <= viewport.height,
        `${mode} ${viewport.width}×${viewport.height} 缺少限高滚动容器：${JSON.stringify(layout)}`);
      check(parseFloat(layout.scrollbar) > 0, `${mode} 的滚动条不可见`);
      if (['auto','scroll'].includes(layout.overflow) && layout.height <= viewport.height) {
        const buttons = root.locator('button:visible, a:visible');
        if (await buttons.count()) {
          const last = buttons.last();
          await last.scrollIntoViewIfNeeded();
          const bounds = await last.boundingBox();
          check(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1, `${mode} 底部操作应能完整滚进窗口`);
        }
      }
      if (mode === 'f2l') {
        const bounds = await page.getByRole('button', {name:'下一步', exact:true}).boundingBox();
        check(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, `F2L ${viewport.width} 宽度的下一步按钮被横向裁切`);
      }
      if (['director','algs','f2l'].includes(mode)) {
        await root.evaluate(element => { element.scrollTop = 0; });
        const canvas = root.locator('canvas').first();
        const bounds = await canvas.boundingBox();
        const scale = await page.evaluate(() => window.__appShell.currentView().preferance.scale);
        await page.mouse.move(bounds.x + bounds.width / 2, Math.min(viewport.height / 2, bounds.y + bounds.height / 2));
        await page.mouse.wheel(0, scale > 0 ? 100 : -100);
        await page.waitForTimeout(200);
        const nextScale = await page.evaluate(() => window.__appShell.currentView().preferance.scale);
        check(nextScale !== scale, `${mode} 魔方区域的滚轮缩放失效`);
        check(await root.evaluate(element => element.scrollTop) === 0, `${mode} 魔方滚轮缩放不应同时滚动页面`);
        await page.evaluate(scale => {
          const preferance = window.__appShell.currentView().preferance;
          preferance.scale = scale;
          preferance.save();
        }, scale);
      }
      if (mode === 'f2l') {
        const original = await page.evaluate(() => window.__appShell.currentView().currentFormula);
        for (const formula of [Array(30).fill("R U R' U'").join(' '),original]) {
          await page.evaluate(formula => { window.__appShell.currentView().currentFormula = formula; }, formula);
          await page.waitForTimeout(150);
          const stage = await page.evaluate(() => {
            const vm = window.__appShell.currentView();
            return {height:vm.stage.clientHeight,canvas:vm.viewport.renderer.domElement.clientHeight};
          });
          check(Math.abs(stage.height - stage.canvas) <= 1, `F2L 公式换行后画布必须适应可用高度：${JSON.stringify(stage)}`);
        }
      }
      results.push({mode,viewport,layout});
    }
  }
  await page.setViewportSize({width:390,height:700});
  const scenarios = [
    ['formulatimer','menu','.setting-menu-card'],
    ['formulatimer','picker','.formula-timer-choices'],
    ['pll6','picker','.pll6-picker-list'],
    ['pll6','help','.pll6-help-content'],
    ['algs','list','.v-window'],
    ['blecross','fixed','.ble-fixed-list'],
    ['blecross','help','.v-dialog--active'],
    ['crossf2l','help','.v-dialog--active']
  ];
  for (const [mode,action,selector] of scenarios) {
    await navigate(mode);
    await page.evaluate(action => {
      const vm = window.__appShell.currentView();
      if (action === 'menu') {
        const findSetting = component => 'menu' in component.$data && 'items' in component.$data ? component : component.$children.map(findSetting).find(Boolean);
        findSetting(vm).menu = true;
      } else if (action === 'picker') vm.openPicker();
      else if (action === 'help') {
        if (typeof vm.openHelp === 'function') vm.openHelp();
        else vm.helpDialog = true;
      } else if (action === 'list') vm.listd = true;
      else vm.fixedCasesOpen = true;
    }, action);
    await page.waitForTimeout(300);
    let container = page.locator(selector).first();
    if (action === 'list') container = container.locator('..');
    const layout = await container.evaluate(element => ({height:element.clientHeight,content:element.scrollHeight,scrollbar:getComputedStyle(element,'::-webkit-scrollbar').width}));
    check(parseFloat(layout.scrollbar) > 0, `${mode}/${action} 的滚动条不可见`);
    const bounds = await container.boundingBox();
    await page.mouse.move(Math.min(350,bounds.x + bounds.width / 2), Math.min(650,bounds.y + bounds.height / 2));
    await page.mouse.wheel(0,300);
    await page.waitForTimeout(200);
    check(await container.evaluate(element => element.scrollTop) > 0, `${mode}/${action} 不能用鼠标滚轮滚动`);
    results.push({mode,action,layout});
  }
  for (const mode of ['blecross','crossf2l']) {
    await navigate(mode);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const vm = window.__appShell.currentView();
      vm.recommendations = Array.from({length:40}, (_, index) => ({
        id:`scroll-fixture-${index}`, front:'F', depth:3, offset:0,
        displayMoves:['R','U',"R'"], physicalMoves:['R','U',"R'"], slots:[], physicalSlots:[], sourceIndices:[],
        route:{score:index,regrips:0,steps:[]}
      }));
      vm.recommendationAll = true;
      vm.recommendationFront = 'ALL';
      vm.recommendationDepth = 'ALL';
      vm.recommendationBusy = false;
      vm.recommendationOpen = true;
    });
    for (const fullscreen of [false,true]) {
      await page.evaluate(fullscreen => { window.__appShell.currentView().recommendationFull = fullscreen; }, fullscreen);
      await page.waitForTimeout(300);
      const prefix = mode === 'blecross' ? 'ble-recommendation' : 'recommendation';
      const container = page.locator(`.${prefix}-${fullscreen ? 'dialog' : 'panel'} .${prefix}-list`);
      const bounds = await container.boundingBox();
      await page.mouse.move(Math.min(350,bounds.x + bounds.width / 2), Math.min(650,bounds.y + bounds.height / 2));
      await page.mouse.wheel(0,300);
      await page.waitForTimeout(200);
      const layout = await container.evaluate(element => ({
        height:element.clientHeight,content:element.scrollHeight,scrollTop:element.scrollTop,
        scrollbar:getComputedStyle(element,'::-webkit-scrollbar').width
      }));
      check(parseFloat(layout.scrollbar) > 0 && layout.scrollTop > 0, `${mode} ${fullscreen ? '全屏' : '底部'}推荐列表必须支持可见滚动条及滚轮滚动`);
      results.push({mode,fullscreen,fixture:'40 generated candidates',layout});
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return {scrolling:results};
}
