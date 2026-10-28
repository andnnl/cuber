async page => {
  await page.goto('http://127.0.0.1:18082/?mode=seamlessop&ui-check=coverage-v1');
  await page.getByRole('heading', { name: '无缝 OP 训练' }).waitFor();
  await page.getByLabel('出题类型').selectOption('pll');
  if (await page.locator('.op-net-before .op-net-cell').count() !== 18 ||
      await page.locator('.op-net-after .op-net-cell').count() !== 21) throw Error('双图格数错误');
  if (await page.locator('.op-net-after .op-net-cell[data-revealed="true"]').count() !== 21) throw Error('右图未显示 OLL 后配色');
  const afterMatches = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return [...document.querySelectorAll('.op-net-after .op-net-cell')].every(cell => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = view.palette.getColor(view.current.afterFacelets[Number(cell.dataset.index)]);
      return cell.style.backgroundColor === probe.style.backgroundColor;
    });
  });
  if (!afterMatches) throw Error('右图预测色与 OLL 后状态不一致');
  if (await page.getByRole('button', { name: 'F/R', exact: true }).count() ||
      await page.getByRole('button', { name: 'L/F', exact: true }).count()) throw Error('多余的六格视图按钮');
  if (await page.locator('.op-predicted').count()) throw Error('旧六格预测与双展开图重复');
  const netMatches = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    const cells = [...document.querySelectorAll('.op-net-before .op-net-cell')];
    return cells.every(cell => {
      const index = Number(cell.dataset.index);
      return cell.style.backgroundColor === (() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = view.palette.getColor(view.world.cube.serialize()[index]);
        return probe.style.backgroundColor;
      })();
    });
  });
  if (!netMatches) throw Error('当前图颜色与 3D 魔方不一致');
  const recolored = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    const face = view.current.beforeFacelets[0];
    const original = view.palette.getColor(face);
    view.palette.color(face, '#123abc');
    return { face, original };
  });
  await page.waitForFunction(() => document.querySelector('.op-net-before [data-index="0"]')?.style.backgroundColor === 'rgb(18, 58, 188)');
  await page.evaluate(({ face, original }) => window.__appShell.$refs.activeView.palette.color(face, original), recolored);
  await page.getByLabel('显示线索').check();
  await page.getByLabel('查看全部轨迹').uncheck();
  if (!await page.getByLabel('练习难度').count() || !await page.getByLabel('查看全部轨迹').count())
    throw Error('缺少重点线索与难度控制');
  if (await page.locator('.op-window-choice').count() !== 4) throw Error('四个六格观察窗口未显示');
  const focusCheck = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { focused: view.netArrows.length, all: view.allNetArrows.length,
      target: document.querySelectorAll('.op-net-after .op-net-focus').length,
      missing: view.focus?.missing || 0 };
  });
  if (focusCheck.focused > focusCheck.all || !focusCheck.target) throw Error('重点线索未对应六格判别端点');
  const highlightColors = await page.evaluate(() => {
    const focused = document.querySelector('.op-net-after .op-net-focus');
    const target = document.querySelector('.op-net-before .op-net-target') || document.querySelector('.op-net-before .op-net-cell');
    target.classList.add('op-net-target');
    const colors = { focus: getComputedStyle(focused).outlineColor,
      target: getComputedStyle(target).boxShadow };
    return colors;
  });
  if (highlightColors.focus !== 'rgb(0, 166, 178)' || !highlightColors.target.includes('rgb(0, 166, 178)'))
    throw Error(`OLL 双面板选中格不是青色：${JSON.stringify(highlightColors)}`);
  const rb = await page.locator('.op-window-choice').filter({ hasText: 'R/B' });
  await rb.click();
  const switched = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return view.focus?.view === 'RB' && view.netArrows.every(arrow => ![45,46,47].includes(arrow.from));
  });
  if (!switched) throw Error('R/B 窗口未切换，或 B 面来源仍画出箭头');
  const rightTarget = await page.evaluate(() => window.__appShell.$refs.activeView.netArrows[0]?.to);
  if (rightTarget !== undefined) {
    await page.locator(`.op-net-after [data-index="${rightTarget}"]`).click();
    if (await page.locator('.op-net-overlay path.op-net-route').count() !== 1)
      throw Error('右图色块不能点选单条箭头');
    await page.locator(`.op-net-after [data-index="${rightTarget}"]`).click();
  }
  await page.getByLabel('查看全部轨迹').check();
  const currentAll = await page.evaluate(() => window.__appShell.$refs.activeView.displayedNetArrows.length);
  if (await page.locator('.op-net-overlay path.op-net-route').count() !== currentAll)
    throw Error('查看全部轨迹未恢复完整箭头');
  await page.getByLabel('查看全部轨迹').uncheck();
  const observation = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { count: view.netArrows.length, displayed: view.displayedNetArrows.length,
      valid: view.netArrows.every(arrow => view.beforeCells.some(cell => cell.index === arrow.from) && view.netBefore[arrow.from] !== view.netBefore[4]) };
  });
  if (!observation.valid || observation.displayed !== await page.locator('.op-net-overlay path.op-net-route').count())
    throw Error('箭头没有只追踪 U/L/F/R 可见格的非顶色贴纸');
  const arrowHeadFill = await page.locator('#op-net-arrow path').evaluate(el => getComputedStyle(el).fill);
  if (arrowHeadFill === 'none' || arrowHeadFill === 'rgba(0, 0, 0, 0)') throw Error('箭头头部被样式隐藏');
  if (observation.count) {
    const arrowStroke = await page.locator('.op-net-route').first().evaluate(el => parseFloat(getComputedStyle(el).strokeWidth));
    if (arrowStroke < 7) throw Error('手机缩小后箭头线条过细');
  }
  if (await page.locator('.op-arrows').count()) throw Error('旧 3D 箭头未移除');
  const nextSource = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return view.netArrows.find(item => item.id !== view.activeNetArrow?.id)?.from;
  });
  if (nextSource !== undefined) {
    await page.locator(`.op-net-before [data-index="${nextSource}"]`).click();
    const selected = await page.evaluate(() => window.__appShell.$refs.activeView.activeNetArrow?.from);
    if (selected !== nextSource || await page.locator('.op-net-overlay path.op-net-route').count() !== 1)
      throw Error('点选来源贴纸未切换单条轨迹');
  }
  await page.getByRole('button', { name: '新题' }).click();
  if (!await page.getByLabel('显示线索').isChecked()) throw Error('新题丢失线索选择');
  const stepMatches = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    view.setStep(1);
    return [...document.querySelectorAll('.op-net-before .op-net-cell')].every(cell => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = view.palette.getColor(view.world.cube.serialize()[Number(cell.dataset.index)]);
      return cell.style.backgroundColor === probe.style.backgroundColor;
    });
  });
  if (!stepMatches) throw Error('步进图颜色与 3D 魔方不一致');
  await page.getByRole('button', { name: '演示验证' }).click();
  await page.getByRole('button', { name: '回到题面' }).click();
  await page.getByLabel('出题类型').selectOption('none');
  const caseInfo = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { name: view.current.targetPll, before: view.current.beforeFacelets,
      scene: view.world.cube.serialize(), after: view.current.afterFacelets };
  });
  if (caseInfo.name !== '无 PLL' || caseInfo.before !== caseInfo.scene) throw Error('无 PLL 题面不一致');
  const oldCase = await page.evaluate(() => {
    const current = window.__appShell.$refs.activeView.current;
    return { pll: current.targetPll, oll: current.ollFormula, y: current.y, scramble: current.scramble };
  });
  await page.getByLabel('出题前 z2').check();
  const rotated = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { pll: view.current.targetPll, oll: view.current.ollFormula, y: view.current.y,
      scramble: view.current.scramble, before: view.current.beforeFacelets, scene: view.world.cube.serialize() };
  });
  if (rotated.pll !== oldCase.pll || rotated.oll !== oldCase.oll || rotated.y !== oldCase.y ||
      !rotated.scramble.startsWith('z2 ') || rotated.before !== rotated.scene) throw Error('z2 没有重建同题');
  const rotatedArrowsValid = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return view.netArrows.every(arrow => view.beforeCells.some(cell => cell.index === arrow.from) && view.netBefore[arrow.from] !== view.netBefore[4]);
  });
  if (!rotatedArrowsValid) throw Error('z2 后仍追踪当前顶面的同色贴纸');
  await page.getByRole('button', { name: '无 PLL', exact: true }).click();
  if (!await page.getByText('题面构造（揭示后）', { exact: false }).count()) throw Error('答对后未揭示公式');
  if (await page.locator('.op-net-after .op-net-cell[data-revealed="true"]').count() !== 21) throw Error('正确答题未揭示目标图');
  const recordCheck = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    const record = view.training.records[0];
    view.replay(record);
    return view.current.z2 === true && view.current.beforeFacelets === record.beforeFacelets && view.settings.z2 === true;
  });
  if (!recordCheck) throw Error('复盘未恢复 z2 与题面');
  const playbackMatches = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    view.setStep(view.current.moves.length);
    return view.world.cube.serialize() === view.current.afterFacelets;
  });
  if (!playbackMatches) throw Error('播放结束状态不匹配目标');
  await page.getByRole('button', { name: '重试同题' }).click();
  if (await page.getByText('题面构造（揭示后）', { exact: false }).count()) throw Error('重试未隐藏公式');
  if (!await page.getByLabel('显示线索').isChecked()) throw Error('重试丢失线索选择');
  await page.reload();
  if (!await page.getByLabel('显示线索').isChecked()) throw Error('线索选择未持久化');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) throw Error('手机横向溢出');
  const compact = await page.evaluate(() => {
    const box = selector => document.querySelector(selector).getBoundingClientRect();
    const u = box('.op-net-before [data-index="4"]');
    const f = box('.op-net-before [data-index="19"]');
    const l = box('.op-net-before [data-index="37"]');
    const before = box('.op-net-before'), after = box('.op-net-after');
    return { heightRatio: f.height / u.height, widthRatio: l.width / u.width,
      sideBySide: after.left > before.right - 1 && Math.abs(after.top - before.top) < 3,
      panelTop: box('.op-panel').top + scrollY };
  });
  if (Math.abs(compact.heightRatio - .5) > .06 || Math.abs(compact.widthRatio - .5) > .06)
    throw Error('侧面贴纸没有缩为 U 面一半');
  if (!compact.sideBySide || compact.panelTop > 600) throw Error('手机布局仍遮住下面的操作面板');
}
