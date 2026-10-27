async page => {
  await page.goto(`http://127.0.0.1:18082/?mode=pll6&check=${Date.now()}`);
  await page.waitForSelector('.pll6-cube canvas');
  if (await page.getByText('先随机整体转体', { exact: false }).count())
    throw new Error('训练首页不应显示案例生成流程长说明');
  const result = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    const docs = new Set();
    for (let chapter = 1; chapter <= 9; chapter++) {
      for (const row of view.rowsForChapter(view.chapters[chapter - 1])) {
        const name = row.cells.find(cell => /^(?:Aa|Ab|E|F|Ga|Gb|Gc|Gd|H|Ja|Jb|Na|Nb|Ra|Rb|T|Ua|Ub|V|Y|Z)(?:（.*）)?$/.test(cell));
        if (name) docs.add(`${chapter}:${name.slice(0, name.indexOf('（') < 0 ? undefined : name.indexOf('（'))}:${name.startsWith('Z') ? row.cells.at(-1) : ''}`);
      }
    }
    const seen = new Set(), missed = [], wrong = [], docDifferences = [], counts = Array(9).fill(0), lines = new Set();
    let checkedRelations = 0;
    const verifyText = (f, row, label) => {
      const text = view.actualStudyCells.join('；');
      const relation = (a, b) => f.relations[Number(a) - 1][Number(b) - 1];
      for (const [chain] of text.matchAll(/[1-6](?:＝[1-6])+/g)) {
        const digits = chain.split('＝');
        for (let i = 1; i < digits.length; i++) {
          checkedRelations++;
          if (relation(digits[0], digits[i]) !== '同') docDifferences.push(`${label} ${f.six}: ${chain}`);
        }
      }
      for (const match of text.matchAll(/([1-6](?:、[1-6])*)\s*↔\s*([1-6](?:、[1-6])*)：(对|邻)/g)) {
        for (const a of match[1].split('、')) for (const b of match[2].split('、')) {
          checkedRelations++;
          if (relation(a, b) !== match[3]) docDifferences.push(`${label} ${f.six}: ${match[0]} 实际${relation(a, b)}`);
        }
      }
      if (text.includes('一组同色、一组对色')) {
        checkedRelations++;
        if ([relation(2, 4), relation(3, 5)].sort().join('') !== '同对') docDifferences.push(`${label} ${f.six}: E 两组关系`);
      }
      const count = Number(row.cells.at(-1).match(/^[2-4]/)?.[0]);
      if (count && !row.cells.at(-1).includes('除去') && f.colorCount !== count)
        docDifferences.push(`${label} ${f.six}: 文档${count}色，实际${f.colorCount}色`);
      for (const match of text.matchAll(/除去\s*([1-6])、([1-6])\s*剩余([三四])色/g)) {
        checkedRelations++;
        const remaining = [...f.six].filter((_, i) => i !== Number(match[1]) - 1 && i !== Number(match[2]) - 1);
        if (new Set(remaining).size !== (match[3] === '三' ? 3 : 4)) docDifferences.push(`${label} ${f.six}: ${match[0]}`);
      }
    };
    for (const item of view.choices) for (const auf of ['', 'U', 'U2', "U'"]) {
      view.world.cube.twister.setup([view.training.invert(item.origin), auf].filter(Boolean).join(' '));
      view.refreshActualFeature();
      const f = view.actualFeature;
      if (!f) { missed.push(`${item.name} ${auf}`); continue; }
      if (f.name !== item.name.slice(4)) wrong.push(`${item.name} ${auf} → ${f.name}`);
      seen.add(f.signature);
      const line = `${f.chapter}:${f.name}:${f.name === 'Z' ? f.colorCount : ''}`;
      lines.add(line);
      if (!docs.has(line) || view.actualStudyRows.length !== 1) wrong.push(`${item.name} ${auf} → ${line} 未唯一对应资料`);
      else verifyText(f, view.actualStudyRows[0], `${item.name} ${auf}`);
    }
    for (const line of lines) counts[Number(line.split(':')[0]) - 1]++;
    let trainingCases = 0;
    for (const item of view.choices) for (const pre of ['', 'y', 'y2', "y'"])
      for (const post of ['', 'U', 'U2', "U'"]) {
        view.world.cube.twister.setup([pre, view.training.invert(item.origin), post].filter(Boolean).join(' '));
        view.refreshActualFeature();
        trainingCases++;
        if (view.actualFeature?.name !== item.name.slice(4))
          wrong.push(`训练转体/AUF ${item.name} ${pre}/${post} → ${view.actualFeature?.name || '无匹配'}`);
        if (view.actualStudyDifferences.length)
          wrong.push(`训练转体/AUF ${item.name} ${pre}/${post} → ${view.actualStudyDifferences.join('；')}`);
      }
    view.loadCase();
    return { seen: seen.size, rows: lines.size, docs: docs.size, counts, trainingCases, checkedRelations,
      differenceCases: [...new Set(docDifferences.map(x => x.split(' → ')[0].match(/^PLL-\w+\s(?:U2|U'|U)?/)?.[0]))].sort(), docDifferences,
      missingDocs: [...lines].filter(x => !docs.has(x)), unusedDocs: [...docs].filter(x => !lines.has(x)), missed, wrong };
  });
  if (result.seen !== 71 || result.rows !== 65 || result.docs !== 65 || result.trainingCases !== 336 || result.checkedRelations < 300 ||
    result.counts.join(',') !== '5,5,5,9,9,8,8,8,8' || result.missingDocs.length ||
    result.unusedDocs.length || result.missed.length || result.wrong.length ||
    result.docDifferences.length)
    throw new Error(JSON.stringify(result));
  await page.getByRole('checkbox', { name: '显示当前特征' }).check();
  await page.getByText('六格观察线索', { exact: false }).waitFor();
  const actual = await page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    const f = view.choices.find(item => item.name === 'PLL-F');
    view.world.cube.twister.setup(view.training.invert(f.origin));
    view.refreshActualFeature();
    const before = view.actualFeature.signature;
    view.world.cube.twister.setup([view.training.invert(f.origin), 'U'].join(' '));
    view.refreshActualFeature();
    const rotated = view.actualFeature.signature;
    view.world.cube.twister.setup('R');
    view.refreshActualFeature();
    const invalid = view.actualFeature;
    view.loadCase();
    return { before, rotated, invalid };
  });
  if (actual.before === actual.rotated || actual.invalid !== null) throw new Error(`实际特征未跟随状态/未知状态被猜测 ${JSON.stringify(actual)}`);
  const display = await page.evaluate(async () => {
    const view = window.__appShell.$refs.activeView;
    const samples = new Map();
    let repeated = null;
    const exceptions = [];
    for (const item of view.choices) for (const auf of ['', 'U', 'U2', "U'"]) {
      const state = [view.training.invert(item.origin), auf].filter(Boolean).join(' ');
      view.world.cube.twister.setup(state);
      view.refreshActualFeature();
      const feature = view.actualFeature;
      if (!feature) throw new Error(`无法识别 ${item.name} ${auf}`);
      const key = `${feature.name}:${feature.six}`;
      if (['Gd:RFBLRL', 'Ja:FFRBBF', 'Jb:LFFRLL'].includes(key)) {
        await view.$nextTick();
        const warning = document.querySelector('.pll6-study-warning')?.textContent || '';
        const text = document.querySelector('.pll6-feature-hint')?.textContent || '';
        exceptions.push({ key, warning, text });
      }
      const previous = samples.get(feature.signature);
      if (previous && previous.six !== feature.six && !repeated) repeated = [previous, { state, six: feature.six }];
      if (!previous) samples.set(feature.signature, { state, six: feature.six });
    }
    if (repeated) {
      view.world.cube.twister.setup(repeated[0].state);
      view.refreshActualFeature();
      view.world.cube.twister.setup(repeated[1].state);
      view.refreshActualFeature();
      await view.$nextTick();
      repeated.push({ rendered: document.querySelector('.pll6-feature-hint')?.textContent || '' });
    }
    view.loadCase();
    return { exceptions, repeated };
  });
  if (display.exceptions.length !== 3 || display.exceptions.some(item =>
    item.warning || !item.text.includes('先看 F 面') || item.text.includes(`当前实际特征 · ${item.key.split(':')[0]}`)) ||
    !display.repeated || !display.repeated[2].rendered.includes('先看 F 面'))
    throw new Error(`实际页面显示未同步：${JSON.stringify(display)}`);
  console.log('PLL 84 个相位状态、336 种前 y 转体/后 AUF、71 签名、65 资料行及实际特征显示通过；Gd/Ja/Jb 朝向描述已核对');
}
