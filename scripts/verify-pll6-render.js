async page => {
  await page.goto('http://127.0.0.1:18082/?mode=pll6');
  await page.waitForSelector('.pll6-cube canvas');
  await page.waitForFunction(() => {
    const view = window.__appShell?.$refs.activeView;
    return view && view.frame !== null && view.world.dirty === false;
  }, { timeout: 2000 });
  const result = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    return { width: view.viewport.renderer.domElement.width, height: view.viewport.renderer.domElement.height,
      frame: view.frame, dirty: view.world.dirty };
  });
  if (!result.width || !result.height) throw new Error(`PLL 画布尺寸无效：${JSON.stringify(result)}`);
  console.log('PLL 3D 首帧渲染通过', result);
}
