async page => {
  const base = page.url().split('?')[0];
  await page.goto(base + '?mode=cfop');
  await page.evaluate(() => localStorage.removeItem('cfopBottomColorZ2'));
  await page.reload();
  const initialColors = await page.evaluate(() => {
    const cubelets = window.__appShell.currentView().world.cube.cubelets;
    const center = index => cubelets.find(cubelet => cubelet.stickers[index] && cubelet.stickers.filter(Boolean).length === 1)
      .stickers[index].material.color.getHexString();
    return {up:center(3), down:center(2), front:center(5)};
  });
  if (initialColors.up !== 'f0f0f0' || initialColors.down !== 'ffd600' || initialColors.front !== '00a020')
    throw Error(`CFOP 初始配色应为白顶绿前：${JSON.stringify(initialColors)}`);
  const toggle = page.locator('[data-cfop-bottom-z2]');
  if (await toggle.count() !== 1) throw Error('CFOP 缺少打乱后切换底色 z2 开关');
  if (await toggle.isChecked()) throw Error('z2 开关首次应关闭');
  await page.evaluate(() => { window.__appShell.currentView().autoCross = false; });
  await toggle.check();
  if (await page.evaluate(() => localStorage.getItem('cfopBottomColorZ2')) !== '1') throw Error('未保存 z2 选择');
  await page.getByRole('button', {name:'随机打乱'}).click();
  const input = page.locator('.cfop-panel input[type=text]');
  const formula = await input.inputValue();
  const tokens = formula.split(/\s+/);
  if (tokens.length !== 28 || tokens[27] !== 'z2' ||
      tokens.slice(0, 27).some(move => !/^[URFDLB](?:2|')?$/.test(move)))
    throw Error(`勾选后随机公式不是 27 步 + z2：${formula}`);
  const result = await page.evaluate(async () => {
    const vm = window.__appShell.currentView();
    const visual = vm.world.cube.serialize();
    vm.stages = [{target:'Cross', moves:['U']}];
    const ready = await vm.refreshRoute();
    const timeline = vm.route?.frames[0]?.facelets;
    const seeked = vm.world.cube.serialize();
    await vm.next();
    const advanced = vm.world.cube.serialize();
    const expectedNext = vm.route?.frames[1]?.facelets;
    const error = vm.error;
    vm.seek(0);
    return {visual, timeline, seeked, advanced, expectedNext, reset:vm.world.cube.serialize(), ready, error};
  });
  if (!result.ready || result.visual !== result.timeline || result.seeked !== result.visual ||
      result.advanced !== result.expectedNext || result.reset !== result.visual || result.error)
    throw Error(`z2 的 3D 与求解起点不一致：${JSON.stringify(result)}`);
  if (result.visual[4] !== 'D' || result.visual[13] !== 'L' || result.visual[22] !== 'F')
    throw Error('z2 后实体贴纸中心没有变成黄顶／橙右／绿前');
  await toggle.uncheck();
  if (await input.inputValue() !== formula) throw Error('切换开关改动了现有公式');
  const afterToggle = await page.evaluate(() => window.__appShell.currentView().world.cube.serialize());
  if (afterToggle !== result.visual) throw Error('切换开关改动了现有 3D 状态');
  await page.reload();
  if (await toggle.isChecked()) throw Error('取消勾选后刷新未恢复');
  await page.getByRole('button', {name:'随机打乱'}).click();
  const normal = (await input.inputValue()).split(/\s+/);
  if (normal.length !== 27 || normal.some(move => !/^[URFDLB](?:2|')?$/.test(move)))
    throw Error('取消勾选后随机打乱不再是 27 步');
  const normalCenters = await page.evaluate(() => window.__appShell.currentView().world.cube.serialize());
  if (normalCenters[4] !== 'U' || normalCenters[13] !== 'R' || normalCenters[22] !== 'F')
    throw Error('普通随机打乱不再是白顶／红右／绿前');
  await toggle.check();
  await input.fill('R U');
  if (await input.inputValue() !== 'R U') throw Error('手动公式被 z2 开关追加');
  await page.reload();
  if (!(await toggle.isChecked())) throw Error('勾选后刷新未恢复');
  const privateTab = await page.context().newPage();
  try {
    await privateTab.addInitScript(() => {
      const get = Storage.prototype.getItem;
      const set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) {
        if (key === 'cfopBottomColorZ2') throw new Error('storage denied');
        return get.call(this, key);
      };
      Storage.prototype.setItem = function(key, value) {
        if (key === 'cfopBottomColorZ2') throw new Error('storage denied');
        return set.call(this, key, value);
      };
    });
    await privateTab.goto(base + '?mode=cfop');
    const privateToggle = privateTab.locator('[data-cfop-bottom-z2]');
    if (await privateToggle.count() !== 1) throw Error('存储不可用时 CFOP 页未显示');
    await privateToggle.check();
    await privateTab.getByRole('button', {name:'随机打乱'}).click();
    if (!(await privateTab.locator('.cfop-panel input[type=text]').inputValue()).endsWith(' z2'))
      throw Error('存储不可用时本会话勾选未生效');
  } finally { await privateTab.close(); }
  const savedColor = await page.evaluate(() => {
    const vm = window.__appShell.currentView();
    const oldPalette = localStorage.getItem('palette');
    vm.palette.color('U', '#AABBCC');
    vm.palette.save();
    vm.onAppDeactivate();
    const center = vm.world.cube.cubelets.find(cubelet =>
      cubelet.stickers[3] && cubelet.stickers.filter(Boolean).length === 1);
    const restored = center.stickers[3].material.color.getHexString();
    if (oldPalette === null) localStorage.removeItem('palette');
    else localStorage.setItem('palette', oldPalette);
    vm.onAppActivate();
    return restored;
  });
  if (savedColor !== 'aabbcc') throw Error(`离开 CFOP 后新保存的配色被旧快照覆盖：${savedColor}`);
  return {z2:'ok', moves:27, timeline:'matched'};
}
