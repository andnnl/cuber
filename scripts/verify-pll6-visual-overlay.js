async page => {
  const origin = page.url().startsWith('http') ? page.url().split('/').slice(0, 3).join('/') : 'http://127.0.0.1:18082';
  await page.goto(`${origin}/?mode=pll6&visual=${Date.now()}`);
  await page.waitForSelector('.pll6-cube canvas');
  const caseBeforeHelp = await page.evaluate(() => window.__appShell.$refs.activeView.training.current.scramble);
  await page.getByRole('button', { name: '术语帮助' }).click();
  const terms = page.getByRole('dialog', { name: '六格观察术语' });
  if (!await terms.isVisible()) throw new Error('术语帮助未打开');
  if (await terms.locator('.pll6-term-card').count() !== 5) throw new Error('未说明五种三格形态');
  for (const [name, pattern] of [['团', 'AAA'], ['眼', 'ABA'], ['棒左', 'AAB'], ['棒右', 'ABB'], ['灯', 'ABC']]) {
    const card = terms.locator(`.pll6-term-card[data-pattern="${pattern}"]`);
    if (!await card.getByText(name, { exact: true }).count() || await card.locator('.pll6-term-tile').count() !== 3)
      throw new Error(`${name} 的图示缺失`);
  }
  if (!await terms.getByText(/左侧 F 面是 1、2、3/).count() ||
    !await terms.getByText(/右侧 R 面是 4、5、6/).count()) throw new Error('左右编号说明缺失');
  await page.keyboard.press('Escape');
  if (await terms.count()) throw new Error('Esc 未关闭术语帮助');
  if (await page.evaluate(() => window.__appShell.$refs.activeView.training.current.scramble) !== caseBeforeHelp)
    throw new Error('关闭帮助误触重试或换题');
  await page.getByRole('checkbox', { name: '显示当前特征' }).check();
  const layer = page.locator('.pll6-visual-overlay');
  await page.waitForTimeout(300);
  if (await layer.locator('rect, [data-sticker]').count()) throw new Error('不应显示编号或小方框');
  if (await layer.evaluate(el => getComputedStyle(el).pointerEvents) !== 'none') throw new Error('覆层挡住手势');
  if (!await layer.locator('line, text').count()) throw new Error('观察关系未标出');
  const endpointGeometry = await page.evaluate(() => {
    const v = window.__appShell.$refs.activeView;
    const a = { x: 100, y: 100 }, b = { x: 200, y: 100 };
    const start = v.edgePoint(a, b, true), end = v.edgePoint(a, b, false);
    return { startDistance: Math.hypot(start.x - a.x, start.y - a.y),
      endDistance: Math.hypot(end.x - b.x, end.y - b.y) };
  });
  if (endpointGeometry.startDistance > 6 || endpointGeometry.endDistance > 6)
    throw new Error(`关系线端点偏离格心：${JSON.stringify(endpointGeometry)}`);
  const straightEndpoints = await page.evaluate(async () => {
    const v = window.__appShell.$refs.activeView;
    const aa = v.choices.find(item => item.name === 'PLL-Aa');
    v.world.cube.twister.setup(v.training.invert(aa.origin));
    v.refreshActualFeature();
    await v.$nextTick();
    return v.shapeEdges.filter(edge => !edge.bridge).map(edge => {
      const line = [...document.querySelectorAll('.pll6-visual-edge--shape line')]
        .find(node => Number(node.getAttribute('x1')) === edge.a.x && Number(node.getAttribute('x2')) === edge.b.x);
      if (!line) return { missing: edge.key };
      return { key: edge.key,
        startDistance: Math.hypot(Number(line.getAttribute('x1')) - edge.a.x, Number(line.getAttribute('y1')) - edge.a.y),
        endDistance: Math.hypot(Number(line.getAttribute('x2')) - edge.b.x, Number(line.getAttribute('y2')) - edge.b.y) };
    });
  });
  if (!straightEndpoints.length || straightEndpoints.some(edge => edge.missing || edge.startDistance > 6 || edge.endDistance > 6))
    throw new Error(`面内直线端点偏离格心：${JSON.stringify(straightEndpoints)}`);
  await page.evaluate(() => window.__appShell.$refs.activeView.loadCase());
  if (await page.locator('.pll6-feature-hint').getByText(/当前实际特征 ·/).count())
    throw new Error('训练揭晓前泄露 PLL 名称');
  if (await page.locator('.pll6-feature-hint').getByText('下一步').count()) throw new Error('不应逐条揭示');
  const card = page.locator('details.pll6-feature-hint');
  if (!await card.evaluate(el => el.open)) throw new Error('线索卡默认应一次展开全部');
  if (!await card.getByText(/六格共 [234] 色（不参与判别）/).count())
    throw new Error('色数应作为参考信息，而非判别步骤');
  await card.locator('summary').first().click();
  if (await card.evaluate(el => el.open)) throw new Error('线索卡不能收起');
  await card.locator('summary').first().click();
  const scan = await page.evaluate(() => {
    const v = window.__appShell.$refs.activeView;
    const wrong = [];
    let count = 0, ja = 0, e = 0;
    for (const item of v.choices) for (const pre of ['', 'y', "y'", 'y2'])
      for (const post of ['', 'U', "U'", 'U2']) {
        v.world.cube.twister.setup([pre, v.training.invert(item.origin), post].filter(Boolean).join(' '));
        v.refreshActualFeature();
        const feature = v.actualFeature;
        const clues = v.visualClues;
        count++;
        if (!feature || clues[0]?.kind !== 'shape' || !v.actualStudyRows.length)
          wrong.push(`${item.name} ${pre}/${post}: missing shape`);
        if (v.originalFeatureCells.some(cell => cell === feature.name || cell.startsWith(`${feature.name}（`)))
          wrong.push(`${item.name}: original hint reveals answer`);
        const distinct = new Set(clues.flatMap(clue => clue.segments)
          .filter(segment => segment.relation !== '同' || (segment.a <= 3) !== (segment.b <= 3))
          .map(segment => `${Math.min(segment.a, segment.b)}-${Math.max(segment.a, segment.b)}:${segment.relation}`));
        if (v.visualEdges.length !== distinct.size)
          wrong.push(`${item.name}: missing or duplicated projected relation`);
        if (v.visualCounts.length !== clues.filter(clue => clue.kind === 'count').length)
          wrong.push(`${item.name}: missing projected color count`);
        for (const clue of clues) {
          if (clue.stickers.some(n => n < 1 || n > 6)) wrong.push(`${item.name}: invalid sticker`);
          for (const segment of clue.segments) if (feature.relations[segment.a-1][segment.b-1] !== segment.relation)
            wrong.push(`${item.name}: invalid relation ${clue.text}`);
        }
        if (feature?.name === 'Ja' && feature.left === '棒左' && feature.right === '棒左') {
          ja++;
          if (clues[1]?.kind !== 'same' || clues[1]?.text !== '同色格：1＝2＝6、4＝5' ||
            !v.visualEdges.some(edge => edge.relation === '同' && [edge.a.number, edge.b.number].includes(6)))
            wrong.push('Ja should show its same-color groups');
        }
        if (feature?.name === 'F' && feature.chapter === 9 &&
          clues[1]?.kind !== 'same')
          wrong.push('F missing three original pairs');
        if (feature?.name === 'E') {
          e++;
          if (clues.length !== 2 || clues[1]?.kind !== 'same' || clues[1].segments.length !== 2 ||
            !['同色格：1＝5、2＝4', '同色格：2＝6、3＝5'].includes(clues[1].text))
            wrong.push('E should show only the shape and its matching same-color pair');
        } else if (feature?.left === '灯' && feature.right === '灯' &&
          ((feature.relations[0][4] === '同' && feature.relations[1][3] === '同') ||
           (feature.relations[1][5] === '同' && feature.relations[2][4] === '同'))) {
          wrong.push(`${feature.name}: E's two clues collide with another PLL`);
        }
      }
    v.loadCase();
    return { count, ja, e, wrong };
  });
  if (scan.count !== 336 || !scan.ja || !scan.e || scan.wrong.length) throw new Error(JSON.stringify(scan));
  await page.getByRole('checkbox', { name: /出题前 z2/ }).check();
  const z2 = await page.evaluate(() => {
    const v = window.__appShell.$refs.activeView;
    const wrong = [];
    for (const item of v.choices) for (const pre of ['', 'y', "y'", 'y2'])
      for (const post of ['', 'U', "U'", 'U2']) {
        v.world.cube.twister.setup(['z2', pre, v.training.invert(item.origin), post].filter(Boolean).join(' '));
        v.refreshActualFeature();
        if (v.actualFeature?.name !== item.name.slice(4) || !v.visualClues.length || !v.originalFeatureCells.length)
          wrong.push(`${item.name} ${pre}/${post}`);
      }
    v.loadCase();
    return { wrong, scramble: v.scramble };
  });
  if (z2.wrong.length || !z2.scramble.startsWith('z2 ')) throw new Error(JSON.stringify(z2));
  await page.reload();
  await page.waitForSelector('.pll6-cube canvas');
  if (!await page.getByRole('checkbox', { name: /出题前 z2/ }).isChecked()) throw new Error('z2 选择没有记忆');
  if (!await page.locator('.pll6-feature-original').count()) throw new Error('原图特征未与计算特征同时显示');
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.__appShell.$refs.activeView.stickerPoints[0].x);
  await page.evaluate(() => {
    const v = window.__appShell.$refs.activeView;
    v.world.camera.position.x += 100;
    v.world.camera.lookAt(v.world.scene.position);
    v.world.dirty = true;
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__appShell.$refs.activeView.stickerPoints[0].x);
  if (before === after) throw new Error('相机变化后标注未跟随');
  await page.evaluate(() => {
    const v = window.__appShell.$refs.activeView;
    v.world.camera.position.set(0, 0, -960);
    v.world.camera.lookAt(v.world.scene.position);
    v.world.dirty = true;
  });
  await page.waitForTimeout(100);
  if (await layer.locator('line, path, text').count()) throw new Error('背面透出了 F/R 观察线');
  await page.evaluate(() => {
    const v = window.__appShell.$refs.activeView;
    v.world.resize();
  });
  await page.waitForTimeout(100);
  const canvas = page.locator('.pll6-cube canvas');
  const box = await canvas.boundingBox();
  const faceletsBeforeGesture = await page.evaluate(() => window.__appShell.$refs.activeView.world.cube.serialize());
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const faceletsAfterGesture = await page.evaluate(() => window.__appShell.$refs.activeView.world.cube.serialize());
  if (faceletsBeforeGesture === faceletsAfterGesture) throw new Error('覆层挡住了魔方手势');
  await page.evaluate(() => { const v = window.__appShell.$refs.activeView; v.world.cube.twister.setup('R'); v.refreshActualFeature(); });
  if (await layer.locator('line, path, text').count()) throw new Error('非 PLL 状态保留旧标注');
  await page.getByRole('button', { name: '新案例' }).click();
  if (!await layer.locator('line, text').count()) throw new Error('切题后标注未恢复');
  await page.getByRole('checkbox', { name: '显示当前特征' }).uncheck();
  if (await layer.count()) throw new Error('关闭提示后仍有标注');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole('checkbox', { name: '显示当前特征' }).check();
  await page.waitForTimeout(150);
  if (!await layer.locator('line, text').count()) throw new Error('手机宽度未显示观察线');
  const mobile = await page.evaluate(() => ({
    canvasWidth: document.querySelector('.pll6-cube canvas').getBoundingClientRect().width,
    overlayWidth: document.querySelector('.pll6-visual-overlay').getBoundingClientRect().width,
    scrollWidth: document.documentElement.scrollWidth
  }));
  if (mobile.scrollWidth > 360 || mobile.overlayWidth !== mobile.canvasWidth) throw new Error(`手机布局溢出：${JSON.stringify(mobile)}`);
  console.log('PLL 六格视觉标注与 336 组合检查通过', scan);
}
