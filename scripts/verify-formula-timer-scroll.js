async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto(`${page.url().split('?')[0]}?mode=formulatimer&scrollcheck=${Date.now()}`);
  await page.locator('.formula-timer-root').waitFor();
  const results = [];
  for (const viewport of [{width:1280,height:820}, {width:1024,height:600}, {width:390,height:700}]) {
    await page.setViewportSize(viewport);
    const root = page.locator('.formula-timer-root');
    const records = page.locator('details').filter({has:page.locator('summary', {hasText:'训练记录'})});
    await records.evaluate(element => { element.open = true; });
    await root.evaluate(element => { element.scrollTop = 0; });
    const layout = await root.evaluate(element => ({
      height:element.clientHeight,
      content:element.scrollHeight,
      overflow:getComputedStyle(element).overflowY,
      scrollbar:getComputedStyle(element, '::-webkit-scrollbar').width
    }));
    assert(['auto', 'scroll'].includes(layout.overflow), `训练页必须能纵向滚动：${JSON.stringify(layout)}`);
    assert(layout.height <= viewport.height && layout.content > layout.height, '超出窗口的训练内容应放在滚动容器内');
    assert(parseFloat(layout.scrollbar) > 0, '滚动条应可见且可拖动');
    const panelBounds = await page.locator('.formula-timer-panel').boundingBox();
    await page.mouse.move(viewport.width - 30, Math.min(viewport.height - 20,panelBounds.y + 20));
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(250);
    assert(await root.evaluate(element => element.scrollTop) > 0, '鼠标滚轮应能滚动训练页');
    await records.scrollIntoViewIfNeeded();
    const bounds = await records.locator('summary').boundingBox();
    assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, '训练记录标题应能完整滚进窗口');
    await root.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const bottom = await root.evaluate(element => element.scrollTop + element.clientHeight >= element.scrollHeight - 2);
    assert(bottom, '应能滚动到训练页底部');
    results.push({viewport, layout});
  }
  return {scrolling:results};
}
