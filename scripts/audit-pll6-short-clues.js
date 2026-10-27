async page => {
  await page.goto(`http://127.0.0.1:18082/?mode=pll6&audit=${Date.now()}`);
  await page.waitForSelector('.pll6-cube canvas');
  return page.evaluate(() => {
    const view = window.__appShell.$refs.activeView;
    const cases = [];
    for (const item of view.choices) for (const auf of ['', 'U', 'U2', "U'"]) {
      view.world.cube.twister.setup([view.training.invert(item.origin), auf].filter(Boolean).join(' '));
      view.refreshActualFeature();
      const feature = view.actualFeature;
      const row = view.actualStudyRows[0];
      if (!feature || !row || view.actualStudyRows.length !== 1) throw new Error(`${item.name} ${auf} 缺失特征行`);
      cases.push({ pll: feature.name, chapter: feature.chapter, shape: `${feature.left}/${feature.right}`,
        six: feature.six, signature: feature.signature, colors: feature.colorCount,
        row: row.cells.join('｜'), cells: view.actualStudyCells, auf, relations: feature.relations });
    }
    view.loadCase();
    const rows = new Map();
    for (const item of cases) {
      const key = `${item.chapter}:${item.pll}${item.pll === 'Z' ? `:${item.colors}` : ''}`;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(item);
    }
    const possible = cases.map(item => item.signature);
    const pairs = [];
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) pairs.push([a, b]);
    const candidates = item => [
      ...pairs.map(([a, b]) => ({ key: `${a + 1}-${b + 1}:${item.relations[a][b]}`,
        text: `${a + 1}${item.relations[a][b]}${b + 1}`,
        test: other => other.relations[a][b] === item.relations[a][b] }))
    ];
    const docCandidates = item => {
      const text = item.cells.join('；');
      const rules = [];
      const add = (key, description, test) => {
        if (!rules.some(rule => rule.key === key)) rules.push({ key, text: description, test });
      };
      for (const [chain] of text.matchAll(/[1-6](?:＝[1-6])+/g)) {
        const numbers = chain.split('＝').map(Number);
        for (const other of numbers.slice(1)) {
          const a = numbers[0], b = other;
          add(`同:${a}-${b}`, `${a}＝${b}`, candidate => candidate.relations[a - 1][b - 1] === '同');
        }
      }
      for (const [, first, second, relation] of text.matchAll(/([1-6](?:、[1-6])*)\s*↔\s*([1-6](?:、[1-6])*)：(对|邻)/g)) {
        const left = first.split('、').map(Number), right = second.split('、').map(Number);
        add(`${first}-${second}:${relation}`, `${first}↔${second}${relation}`,
          candidate => left.every(a => right.every(b => candidate.relations[a - 1][b - 1] === relation)));
      }
      if (text.includes('2↔4 与 3↔5 一组同色、一组对色'))
        add('E混合', '2↔4 与 3↔5 一同一对', candidate =>
          [candidate.relations[1][3], candidate.relations[2][4]].sort().join('') === '同对');
      return rules;
    };
    const result = [];
    for (const [key, samples] of rows) {
      const rivals = cases.filter(item => item.shape === samples[0].shape && !samples.includes(item));
      const invariant = candidates(samples[0]).filter(rule => samples.every(rule.test));
      // 形态已告诉我们面内的同色关系，避免把它再作为一条判别条件。
      const useful = invariant.filter(rule => rivals.some(other => !rule.test(other)) &&
        (!/^[1-6]-[1-6]:同$/.test(rule.key) ||
          (Number(rule.key[0]) <= 3) !== (Number(rule.key[2]) <= 3)));
      let best = null;
      const find = (prefix, offset, limit) => {
        const covers = rivals.every(other => prefix.some(rule => !rule.test(other)));
        if (covers) { best = prefix; return true; }
        if (prefix.length === limit) return false;
        for (let i = offset; i < useful.length; i++) if (find([...prefix, useful[i]], i + 1, limit)) return true;
        return false;
      };
      for (let size = 0; size <= 5 && best === null; size++) find([], 0, size);
      const documented = docCandidates(samples[0]).filter(rule => samples.every(rule.test) && rivals.some(other => !rule.test(other)));
      let docBest = null;
      const findDocumented = (prefix, offset, limit) => {
        if (rivals.every(other => prefix.some(rule => !rule.test(other)))) { docBest = prefix; return true; }
        if (prefix.length === limit) return false;
        for (let i = offset; i < documented.length; i++)
          if (findDocumented([...prefix, documented[i]], i + 1, limit)) return true;
        return false;
      };
      for (let size = 0; size <= 4 && docBest === null; size++) findDocumented([], 0, size);
      result.push({ key, shape: samples[0].shape, six: samples.map(x => x.six), auf: samples.map(x => x.auf),
        row: samples[0].row, shortest: best?.map(x => x.text) || null,
        docShortest: docBest?.map(x => x.text) || null, documented: documented.map(x => x.text),
        invariant: useful.map(x => x.text), rivals: [...new Set(rivals.map(x => x.pll))] });
    }
    const signatures = new Map();
    for (const item of cases) {
      if (!signatures.has(item.signature)) signatures.set(item.signature, []);
      signatures.get(item.signature).push(`${item.chapter}:${item.pll}${item.pll === 'Z' ? `:${item.colors}` : ''}`);
    }
    return { cases: cases.length, signatures: new Set(possible).size, rows: rows.size,
      collisions: [...signatures].filter(([, keys]) => new Set(keys).size > 1).map(([signature, keys]) => ({ signature, keys })),
      unresolved: result.filter(x => x.shortest === null).map(x => x.key),
      docUnresolved: result.filter(x => x.docShortest === null).map(x => x.key), details: result };
  });
}
