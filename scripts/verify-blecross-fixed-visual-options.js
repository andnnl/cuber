async page => {
  await page.goto('http://127.0.0.1:18082/?mode=blecross');
  await page.evaluate(() => {
    localStorage.setItem('bleFixedCaseZ2','0');
    localStorage.setItem('bleVisGhost','0');
    localStorage.setItem('bleVisHide','0');
  });
  await page.reload();
  await page.waitForFunction(() => window.__bleCross?.world);
  const original = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { cube: vm.world.cube.serialize(), phase: vm.phase };
  });
  await page.locator('[data-ble-fixed-open]').click();
  await page.waitForFunction(() => window.__bleCross.fixedCases?.selected);
  const ghost = page.locator('[data-ble-fixed-ghost]');
  const hide = page.locator('[data-ble-fixed-hide]');
  const z2 = page.locator('[data-ble-fixed-z2]');
  const custom = page.locator('[data-ble-fixed-bg-custom]');
  if (await ghost.isChecked() !== await page.evaluate(() => window.__bleCross.visGhost)) throw new Error('半透明未读取训练设置');
  if (await hide.isChecked() !== await page.evaluate(() => window.__bleCross.visHide)) throw new Error('隐藏无关未读取训练设置');
  await ghost.check();
  await hide.check();
  await custom.fill('#334455');
  const shared = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { ghost:vm.visGhost, hide:vm.visHide, background:vm.backgroundColor,
      storage:[localStorage.getItem('bleVisGhost'),localStorage.getItem('bleVisHide'),localStorage.getItem('cubeBackground.blecross.color'),localStorage.getItem('cubeBackground.blecross.mode')],
      caseBackground:getComputedStyle(document.querySelector('.ble-fixed-canvas')).backgroundColor };
  });
  if (!shared.ghost || !shared.hide || shared.background !== '#334455' ||
      JSON.stringify(shared.storage) !== JSON.stringify(['1','1','#334455','custom']) || shared.caseBackground !== 'rgb(51, 68, 85)') {
    throw new Error(`案例设置未共享：${JSON.stringify(shared)}`);
  }
  const painted = await page.evaluate(() => {
    const scene = window.__bleCross.fixedCases.world.cube;
    return { state:scene.serialize(), allFramesHidden:scene.cubelets.filter(piece => piece.exist).every(piece => !piece.frame.visible),
      highlightedStickers:scene.cubelets.flatMap(piece => piece.stickers).filter(sticker => sticker?.material?.type === 'MeshBasicMaterial').length };
  });
  if (painted.state.length !== 54 || !painted.allFramesHidden || painted.highlightedStickers !== 8) {
    throw new Error(`十字块可视化与 BLECross 不一致：${JSON.stringify(painted)}`);
  }
  const yellow = await page.evaluate(() => {
    const c = window.__bleCross.fixedCases;
    return { selected:c.selected.id, bottom:c.world.cube.serialize()[31], needed:[...c.neededSignatures].sort(), step:c.step };
  });
  await page.locator('.ble-fixed-controls button').nth(2).click();
  await z2.click();
  const white = await page.evaluate(() => {
    const c = window.__bleCross.fixedCases;
    return { selected:c.selected.id, bottom:c.world.cube.serialize()[31], needed:[...c.neededSignatures].sort(), step:c.step,
      stored:localStorage.getItem('bleFixedCaseZ2') };
  });
  if (yellow.selected !== white.selected || white.step !== 0 || white.stored !== '1' ||
      yellow.bottom === white.bottom || JSON.stringify(yellow.needed) === JSON.stringify(white.needed)) {
    throw new Error(`z2 未切换案例底色并归零：${JSON.stringify({yellow,white})}`);
  }
  const neededBefore = white.needed.join(',');
  await page.evaluate(() => {
    const c = window.__bleCross.fixedCases;
    c.world.cube.twister.twist(new (c.world.cube.history.list[0].constructor)('y'), true, true);
    c.world.controller.wholeTurnCallbacks.forEach(callback => callback('y', 1));
  });
  const neededAfter = await page.evaluate(() => [...window.__bleCross.fixedCases.neededSignatures].sort().join(','));
  if (neededBefore !== neededAfter) throw new Error('整体旋转使隐藏目标选错块');
  // 手动视角转动后重新选择，再验证白底案例可播放回还原态。
  await page.evaluate(() => { const c=window.__bleCross.fixedCases; c.select(c.selected); });
  await page.locator('.ble-fixed-controls button').last().click();
  await page.waitForFunction(() => {const c=window.__bleCross.fixedCases;return c.step===c.selected.moves.length;});
  if (!(await page.evaluate(() => window.__bleCross.fixedCases.world.cube.complete))) throw new Error('白底播放没有完成');
  await page.locator('.ble-fixed-top button').click();
  const after = await page.evaluate(() => ({cube:window.__bleCross.world.cube.serialize(),phase:window.__bleCross.phase}));
  if (JSON.stringify(after) !== JSON.stringify(original)) throw new Error('案例改动了主训练状态');
  await page.locator('[data-ble-fixed-open]').click();
  if (!(await page.evaluate(() => window.__bleCross.fixedCases.z2On))) throw new Error('z2 状态没有记忆');
  if (!(await ghost.isChecked()) || !(await hide.isChecked()) ||
      await page.locator('.ble-fixed-canvas').evaluate(el => getComputedStyle(el).backgroundColor) !== 'rgb(51, 68, 85)') {
    throw new Error('重新打开案例后未读取 BLECross 三项共用设置');
  }
  return { shared, painted, yellow, white, main:'unchanged' };
}
