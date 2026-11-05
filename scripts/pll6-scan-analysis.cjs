const fs = require('node:fs');
const path = require('node:path');

const LEFT_QUERIES = [{a:1,b:2}, {a:1,b:3}, {a:2,b:3}];
const LEFT_NAMES = {
  '同同同':'团', '同邻邻':'棒左·邻色', '同对对':'棒左·对色',
  '邻邻同':'棒右·邻色', '对对同':'棒右·对色',
  '邻同邻':'眼·邻色', '对同对':'眼·对色',
  '对邻邻':'灯·1与2对色', '邻对邻':'灯·1与3对色', '邻邻对':'灯·2与3对色',
};

function enumerateCases() {
  globalThis.requestAnimationFrame ||= () => 0;
  const Cube = require('../.tmp/cuber/cube').default;
  const {parseOpFormula} = require('../.tmp/ble/op-formula');
  const {describePllSix} = require('../.tmp/ble/pll-six-sticker');
  const groups = require('../src/vue/Algs/algs.json');
  const plls = groups[2].items;
  if (plls.length !== 21 || new Set(plls.map(item => item.name)).size !== 21)
    throw Error('公式源必须恰有 21 个不同的 PLL');
  return plls.flatMap(item => ['', 'U', 'U2', "U'"].map(auf => {
    const formula = item.exp || item.origin;
    const scramble = [...parseOpFormula(formula).inverse, auf].filter(Boolean).join(' ');
    const cube = new Cube(3);
    cube.twister.setup(scramble);
    const facelets = cube.serialize();
    const description = describePllSix(facelets);
    if (!description) throw Error(`无法提取 ${item.name} ${auf}`);
    cube.twister.setup([scramble, ...(auf ? parseOpFormula(auf).inverse : []), formula].filter(Boolean).join(' '));
    if (!cube.complete) throw Error(`${item.name} ${auf} 逆公式不能还原`);
    const sample = {id:`${item.name}:${auf || '0'}`, name:item.name.replace(/^PLL-/, ''), auf:auf || '无',
      formula, scramble, facelets, ...description};
    sample.leftKey = relationKey(sample, LEFT_QUERIES);
    return sample;
  }));
}

function queriesForAnchors(anchors) {
  return [...LEFT_QUERIES, {a:4,b:5}, {a:4,b:6}, {a:5,b:6},
    ...anchors.flatMap(reference => [4,5,6].map(position => ({a:reference,b:position})))].sort((first, second) => first.b - second.b || first.a - second.a);
}

function relationKey(sample, queries) {
  return queries.map(({a:reference,b:position,equalityOnly}) => {
    const relation = sample.relations[reference - 1][position - 1];
    return equalityOnly && relation !== '同' ? '异' : relation;
  }).join('');
}

function auditConflicts(cases, queries) {
  const grouped = new Map();
  for (const sample of cases) {
    const key = relationKey(sample, queries);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(sample);
  }
  const groups = [...grouped].map(([key, samples]) => ({key, names:[...new Set(samples.map(sample => sample.name))].sort(),
    ids:samples.map(sample => sample.id), sixes:[...new Set(samples.map(sample => sample.six))]}));
  return {queries, groups, conflicts:groups.filter(group => group.names.length > 1)};
}

function buildTree(cases, queries, targetField = 'name', startAt = 2) {
  const cache = new Map();
  function search(samples, cursor) {
    const targets = [...new Set(samples.map(sample => sample[targetField]))];
    if (targets.length === 1) return {kind:'leaf', target:targets[0], count:samples.length, worst:0, total:0};
    const key = `${cursor}:${samples.map(sample => sample.id).sort().join('|')}`;
    if (cache.has(key)) return cache.get(key);
    let best = null;
    for (const query of queries) {
      if (query.b < cursor) continue;
      const partitions = new Map();
      for (const sample of samples) {
        const answer = relationKey(sample, [query]);
        if (!partitions.has(answer)) partitions.set(answer, []);
        partitions.get(answer).push(sample);
      }
      if (partitions.size < 2) continue;
      const branches = Object.fromEntries([...partitions].map(([answer, subset]) => [answer, search(subset, query.b)]));
      if (Object.values(branches).some(branch => branch.kind === 'conflict')) continue;
      const worst = 1 + Math.max(...Object.values(branches).map(branch => branch.worst));
      const total = samples.length + Object.values(branches).reduce((sum, branch) => sum + branch.total, 0);
      const score = [worst, total, query.b, query.b - query.a];
      if (!best || score.some((value, index) => value < best.score[index] &&
        score.slice(0,index).every((earlier, offset) => earlier === best.score[offset]))) {
        best = {kind:'question', ...query, count:samples.length, worst, total, score, branches};
      }
    }
    const result = best || {kind:'conflict', targets, ids:samples.map(sample => sample.id)};
    cache.set(key, result);
    return result;
  }
  return search(cases, startAt);
}

function followTree(tree, sample) {
  const route = [];
  let node = tree;
  while (node.kind === 'question') {
    const answer = relationKey(sample, [node]);
    route.push({a:node.a, b:node.b, answer});
    node = node.branches[answer];
    if (!node) return {target:null, path:route, reason:'未覆盖的关系分支'};
  }
  return {target:node.kind === 'leaf' ? node.target : null, path:route, reason:node.kind};
}

function analyzeEqualitySupplement(cases, baseQueries, conflicts) {
  const preferred = [{a:2,b:4}, {a:3,b:5}];
  const remaining = queriesForAnchors([1,2,3]).filter(query => query.a <= 3 && query.b >= 4 &&
    !preferred.some(pair => pair.a === query.a && pair.b === query.b));
  const candidates = [...preferred,...remaining].map(query => ({...query,equalityOnly:true}));
  function minimum(samples, base) {
    for (let size = 0; size <= candidates.length; size++) {
      let result = null;
      function choose(selected, offset) {
        if (selected.length === size) {
          if (!auditConflicts(samples, [...base,...selected]).conflicts.length) result = selected;
          return;
        }
        for (let index = offset; index <= candidates.length - (size - selected.length) && !result; index++)
          choose([...selected,candidates[index]], index + 1);
      }
      choose([],0);
      if (result) return result;
    }
    return null;
  }
  const groups = conflicts.map(group => {
    const samples = cases.filter(sample => group.ids.includes(sample.id));
    const chosen = minimum(samples, []);
    const audit = auditConflicts(samples, chosen || candidates);
    return {baseKey:group.key, names:group.names, minimum:chosen, remainingConflicts:audit.conflicts.length,
      rules:audit.groups.map(rule => ({...rule,
        conditions:[...(rule.key)].map((answer,index) => ({...(chosen || candidates)[index],answer}))}))};
  });
  return {minimum:minimum(cases, baseQueries),
    audit:auditConflicts(cases,[...baseQueries,...preferred.map(query => ({...query,equalityOnly:true}))]), groups};
}

function analyzeAllEquality(cases) {
  const fullQueries = queriesForAnchors([1,2,3]);
  const equalityQueries = fullQueries.map(query => ({...query,equalityOnly:true}));
  const audit = auditConflicts(cases,equalityQueries);
  const samples = cases.map(sample => {
    const groups = [];
    for (let position = 1; position <= 6; position++) {
      const group = groups.find(members => sample.six[members[0] - 1] === sample.six[position - 1]);
      if (group) group.push(position); else groups.push([position]);
    }
    const positions = Array.from({length:6}, (_,index) => {
      const earlier = Array.from({length:index}, (_,offset) => offset + 1);
      return {position:index + 1,
        sameAs:earlier.filter(reference => sample.six[reference - 1] === sample.six[index]),
        differentFrom:earlier.filter(reference => sample.six[reference - 1] !== sample.six[index])};
    });
    return {id:sample.id,name:sample.name,auf:sample.auf,six:sample.six,groups,positions};
  });
  const conflicts = audit.conflicts.map(group => {
    const members = cases.filter(sample => group.ids.includes(sample.id));
    const candidates = fullQueries.filter(query => members.some(sample => relationKey(sample,[query]) === '对') &&
      members.some(sample => relationKey(sample,[query]) === '邻'));
    let supplement = null;
    for (let size = 1; size <= candidates.length && !supplement; size++) {
      function choose(selected,offset) {
        if (selected.length === size) {
          if (!auditConflicts(members,selected).conflicts.length) supplement = selected;
          return;
        }
        for (let index = offset; index <= candidates.length - (size - selected.length) && !supplement; index++)
          choose([...selected,candidates[index]],index + 1);
      }
      choose([],0);
    }
    const resolved = auditConflicts(members,supplement || fullQueries);
    return {...group, equalityGroups:samples.find(sample => sample.id === group.ids[0]).groups,
      supplement, remainingConflicts:resolved.conflicts.length,
      rules:resolved.groups.map(rule => ({...rule,
        conditions:[...rule.key].map((answer,index) => ({...(supplement || fullQueries)[index],answer}))}))};
  });
  return {...audit,samples,conflicts};
}

function buildAnalysis(cases = enumerateCases()) {
  const anchorAudits = Array.from({length:8}, (_, mask) => {
    const anchors = [1,2,3].filter(position => mask & (1 << (position - 1)));
    return {anchors, ...auditConflicts(cases, queriesForAnchors(anchors))};
  });
  const rightQueries = queriesForAnchors([1,2,3]).filter(query => query.b >= 4);
  const classes = [...new Set(cases.map(sample => sample.leftKey))].sort().map(key => {
    const members = cases.filter(sample => sample.leftKey === key);
    if (!LEFT_NAMES[key]) throw Error(`未命名的左侧类别：${key}`);
    return {key, title:LEFT_NAMES[key], count:members.length, names:[...new Set(members.map(sample => sample.name))].sort(),
      queries:rightQueries, tree:buildTree(members, rightQueries, 'name', 4)};
  });
  const leftTree = buildTree(cases, LEFT_QUERIES, 'leftKey');
  const routes = cases.map(sample => {
    const left = followTree(leftTree, sample);
    const group = classes.find(item => item.key === left.target);
    const right = group ? followTree(group.tree, sample) : {target:null,path:[]};
    return {id:sample.id, name:sample.name, auf:sample.auf, six:sample.six, class:group?.title,
      predicted:right.target, path:[...left.path,...right.path], leftPath:left.path, rightPath:right.path};
  });
  const failures = routes.filter(route => route.predicted !== route.name ||
    route.path.some((entry, index) => index && entry.b < route.path[index - 1].b));
  const localBoundaryAudit = auditConflicts(cases, [...queriesForAnchors([]),{a:3,b:4}]);
  const equalitySupplement = analyzeEqualitySupplement(cases, localBoundaryAudit.queries, localBoundaryAudit.conflicts);
  return {cases, classes, leftTree, routes, failures, anchorAudits, equalitySupplement,
    fullEqualityAudit:analyzeAllEquality(cases),
    adjacentAudit:auditConflicts(cases, [1,2,3,4,5].map(reference => ({a:reference,b:reference+1}))),
    localBoundaryAudit,
    metrics:{count:cases.length, classes:classes.length,
      worstComparisons:Math.max(...routes.map(route => route.path.length)),
      meanComparisons:routes.reduce((sum, route) => sum + route.path.length, 0) / routes.length,
      worstRightComparisons:Math.max(...routes.map(route => route.rightPath.length)),
      earlyStops:Object.fromEntries([3,4,5,6].map(position => [position, routes.filter(route => route.path.at(-1)?.b === position).length]))}};
}

function formatTree(tree, indent = '') {
  if (tree.kind === 'leaf') return [`${indent}→ ${tree.target}`];
  if (tree.kind === 'conflict') return [`${indent}冲突：${tree.targets.join('、')}`];
  const lines = [`${indent}看第 ${tree.b} 格，与已记住的第 ${tree.a} 格比较：`];
  for (const answer of ['同','对','邻']) if (tree.branches[answer]) {
    lines.push(`${indent}  ${answer}色：`);
    lines.push(...formatTree(tree.branches[answer], `${indent}    `));
  }
  return lines;
}

function renderMarkdown(report) {
  const {metrics} = report;
  const routeText = route => route.map(entry => `${entry.a}–${entry.b}${entry.answer}`).join(' → ') || '直接确定';
  const lines = ['# PLL 六格从左到右识别：穷举与冲突分析', '',
    '进一步精简的限深搜索、各方案最少次数证据与新版路径，见同目录 `pll6-shortest-paths.md`；本报告保留左侧先分 10 类的原方案，供对照。', '',
    '## 范围与约束', '',
    '- 独立分析原型，不改变现有九大类或训练界面。1、2、3 是左面从左到右，4、5、6 是右面从左到右。',
    '- 用项目内 21 条真实 PLL 公式取逆，再追加无/U/U2/U\'，生成 84 个带标签案例。标签来自公式名，不从旧分类表反推。',
    '- 这 84 例是 21 类 × 4 个顶层观察朝向，不是全部魔方状态，也不要求判出准确 AUF。',
    '- “同色/对色/邻色”指侧面颜色之间的关系，不指格子是否相邻；默认配色红橙对、绿蓝对。',
    '- 先仅根据 1、2、3 格分类；再按 4→5→6 读取右侧，可以提早结束。允许右侧任意一格与左侧任意一格比较。',
    '- 右侧的候选问题包含 1–4、2–4、3–4、1–5、2–5、3–5、1–6、2–6、3–6 共 9 个跨面比较，以及 4–5、4–6、5–6 共 3 个面内比较。',
    '- 允许短期记忆：保留左侧类别及后续分支所需的左侧参照颜色。2、3 双锚点是单独验证的简化方案，不限制正式搜索使用第 1 格。',
    '- 与左侧颜色比较时，使用记忆，不重新观察左侧；不声称完全不记颜色也能唯一识别。',
    '- 右侧已读的第 4、5 格也可能作为后续比较参照；树的代价是关系判断次数，不是实际眼动次数。',
    '', '## 冲突检查结果', '',
    '| 观察信息 | 关系签名数 | 跨 PLL 冲突组数 |', '|---|---:|---:|',
    `| 仅 1–2、2–3、3–4、4–5、5–6 | ${report.adjacentAudit.groups.length} | ${report.adjacentAudit.conflicts.length} |`,
    `| 左右内部完整关系 + 3–4 边界关系 | ${report.localBoundaryAudit.groups.length} | ${report.localBoundaryAudit.conflicts.length} |`,
    `| 上一行再加 2–4、3–5 是否同色 | ${report.equalitySupplement.audit.groups.length} | ${report.equalitySupplement.audit.conflicts.length} |`,
    `| 只看全部 15 对是否同色（不保留对/邻） | ${report.fullEqualityAudit.groups.length} | ${report.fullEqualityAudit.conflicts.length} |`,
    ...report.anchorAudits.map(audit => `| 左右内部完整关系 + 左侧锚点 ${audit.anchors.join('、') || '无'} | ${audit.groups.length} | ${audit.conflicts.length} |`),
    '', '同一 PLL 多个方向得到相同签名不算冲突。完整 15 对关系得到 71 种签名，对应 84 个案例；不能强行把对称的重复方向拆成不同 PLL。',
    '在“固定左侧锚点 + 左右各自的完整内部关系”这个模型内，单个锚点均不够；双锚点只有 2、3 这一组消除了所有跨 PLL 冲突。这不是对任意人类记忆策略的全局最优性证明。',
    '', '## 建议的第一层：只看左侧，分 10 类', '',
    '第一层不依赖右侧，不再先看两面再回来细分。先按同色结构分团、左棒、右棒、眼、灯 5 个粗类，再用对色/邻色细分成 10 个左侧入口；也可直接按左侧树进入 10 类。三个位置的关系依次记为 1–2 / 1–3 / 2–3。', '',
    '| 左侧类别 | 关系 | 84 例中的数量 | 仍可能的 PLL | 右侧最多判断次数 |', '|---|---|---:|---|---:|',
    ...report.classes.map(group => `| ${group.title} | ${group.key.split('').join('/')} | ${group.count} | ${group.names.join('、')} | ${group.tree.worst ?? '冲突'} |`),
    '', '## 单向判别树', '',
    '左侧分类树：', '', '```text', ...formatTree(report.leftTree), '```', '',
    '确认左侧类别后，只执行该类别的右侧分支。每次问题只能比较“当前格”和更早已记住的格，问题的当前格编号绝不减小；同一当前格可能需要多次关系判断。',
    '即使某格没有立即提出问题，也要在顺序扫视时暂存它的颜色，供后面的比较使用；例如直接问 4–5，表示先看到并记住第 4 格，再在第 5 格作判断。',
    '搜索在这个约束内逐节点优先最小化最坏比较次数，同分再选较小的总比较次数、较早的当前格、较近的参照格。未对人类记忆负担或全树平均代价宣称全局最优。',
    `84 例全部识别正确；总比较次数最坏 ${metrics.worstComparisons} 次、均值 ${metrics.meanComparisons.toFixed(2)} 次（84 例等权），右侧最坏 ${metrics.worstRightComparisons} 次。`,
    `最晚观察到第几格即可确定：${Object.entries(metrics.earlyStops).map(([position,count]) => `${position} 格 ${count} 例`).join('；')}。`,
    ...report.classes.flatMap(group => ['', `### ${group.title}`, '', '```text', ...formatTree(group.tree), '```']),
    '', '## 84 例完整清单与判别路径', '',
    '六格字母是逻辑面色标识，不是屏幕颜色名。每条路径 a–b同/对/邻表示“看到第 b 格时，与记住的第 a 格比较”。', '',
    '| PLL | 朝向 AUF | 六格 123 / 456 | 左侧类别 | 左侧判断 → 右侧判断 | 判定 |', '|---|---|---|---|---|---|',
    ...report.routes.map(route => `| ${route.name} | ${route.auf} | ${route.six.slice(0,3)} / ${route.six.slice(3)} | ${route.class} | ${routeText(route.leftPath)}；${routeText(route.rightPath)} | ${route.predicted || '冲突'} |`),
    '', '## 冲突反例及补充同色判别', '',
    '这些冲突以“左右各自三格的完整同/对/邻关系 + 3–4 边界关系”为前提，不是说在完整六格信息下仍无法识别。补上跨面的具体同色位置后，10 组全部可以消除。',
    '固定只增加两项：2 与 4 是否同色、3 与 5 是否同色，整个 84 例集合即无跨 PLL 冲突；算法穷举所有 9 个跨面同色问题的子集，确认在这个前提下单个固定问题不够、两个足够。',
    '进一步验证：保留左右各自三格的完整同/对/邻关系时，加上这两项同色比较后，3–4 边界关系也可以省略，仍为 71 种签名、0 组跨 PLL 冲突。仅保留形态或仅保留所有同色位置则不保证唯一识别，对色/邻色信息仍不能全部删除。',
    '“异色”只表示不相同，这里不要求进一步区分对色或邻色。下列规则必须先命中所在行的原局部特征，不能脱离前提单独使用。', '',
    '| 原局部关系签名 | 原冲突 PLL | 最少补充比较 | 补充条件 → PLL（六格反例） |', '|---|---|---|---|',
    ...report.equalitySupplement.groups.map(group => `| ${group.baseKey} | ${group.names.join('、')} | ${group.minimum.map(query => `${query.a}–${query.b} 是否同色`).join('；')} | ${group.rules.map(rule => `${rule.conditions.map(condition => `${condition.a}–${condition.b}${condition.answer}色`).join('且')} → ${rule.names.join('/')}（${rule.sixes.join('、')}）`).join('；')} |`),
    '', '## 加强核验：全部位置的同色判断', '',
    '按扫描顺序完整检查：第 2 格对比 1；第 3 格对比 1、2；第 4 格对比 1、2、3；第 5 格对比 1、2、3、4；第 6 格对比 1、2、3、4、5。共 15 对，不遗漏任何位置组合。',
    '每项都记录“同色”或“不同色”，因此“没有发现同色”也是一个判断结果，而不是省略条件。第 1 格作为起始颜色参照，不与自己比较。',
    '同色分组例如 1＝3＝5 / 2＝4 / 6，表示组内同色、组间都不同色；单独一格也是一个独立颜色组。',
    '这是完整性核验层，不要求每次真人识别都执行 15 次；快速识别仍可使用前面的单向决策树，只有不确定时再展开全部关系。', '',
    '| PLL | AUF | 六格 | 完整同色分组 | 逐格同色判断（未列出的位置均不同色） |', '|---|---|---|---|---|',
    ...report.fullEqualityAudit.samples.map(sample => `| ${sample.name} | ${sample.auf} | ${sample.six} | ${sample.groups.map(group => group.join('＝')).join(' / ')} | ${sample.positions.slice(1).map(position => `${position.position}：${position.sameAs.length ? `同${position.sameAs.join('、')}` : '与前面均不同色'}`).join('；')} |`),
    '', '### 全部同色位置仍相同的冲突及补充条件', '',
    `仅保留“是否同色”时，84 例合并成 ${report.fullEqualityAudit.groups.length} 种签名，其中 ${report.fullEqualityAudit.conflicts.length} 组存在跨 PLL 冲突。必须再加下列对色/邻色条件，而不能因同色信息完整就直接确认。`,
    '以下补充规则仅在完整同色分组相同的前提下使用；每组的补充问题由穷举找到最少比较对数，不表示所有组共用一条规则。', '',
    '| 完整同色分组 | 仍可能的 PLL | 最少补充比较 | 对色/邻色 → PLL |', '|---|---|---|---|',
    ...report.fullEqualityAudit.conflicts.map(group => `| ${group.equalityGroups.map(members => members.join('＝')).join(' / ')} | ${group.names.join('、')} | ${(group.supplement || []).map(query => `${query.a}–${query.b}`).join('；')} | ${group.rules.map(rule => `${rule.conditions.map(condition => `${condition.a}–${condition.b}${condition.answer}色`).join('且')} → ${rule.names.join('/')}（${rule.sixes.join('、')}）`).join('；')} |`),
    '', '## 使用与局限', '',
    '- 运行 `npm run analyze:pll-scan` 重新生成本报告及同名 JSON（全部题面、树、路径和各方案冲突清单）。',
    '- 运行 `npm run test:pll-scan` 验证穷举数量、冲突注入、单向顺序、颜色重命名和额外 AUF/z2 变化。',
    '- 关系信息足够区分，不等于口诀已经足够好记。下一步应选容易看错的分支做真人练习，评估两色记忆与局部比较是否确实减少回看。',
    '- 冲突叶/未覆盖分支返回无法识别，不猜 PLL；决策树不是合法性校验器，超出合法 PLL 集合的任意六色输入不在本原型的正确性承诺内。', ''];
  return lines.join('\n');
}

if (require.main === module) {
  const report = buildAnalysis();
  if (report.failures.length || report.anchorAudits.find(audit => audit.anchors.join() === '2,3').conflicts.length)
    throw Error('单向识别存在冲突或错判，停止生成成功报告');
  if (report.fullEqualityAudit.conflicts.some(group => !group.supplement || group.remainingConflicts))
    throw Error('全部同色位置的补充判别尚有未解决冲突');
  const output = path.resolve(process.argv[2] || 'docs/analysis');
  fs.mkdirSync(output, {recursive:true});
  fs.writeFileSync(path.join(output, 'pll6-left-to-right.json'), `${JSON.stringify(report,null,2)}\n`);
  fs.writeFileSync(path.join(output, 'pll6-left-to-right.md'), renderMarkdown(report));
  console.log(JSON.stringify({output, ...report.metrics, failures:report.failures.length,
    equalityPairs:report.fullEqualityAudit.queries.length,
    equalitySignatures:report.fullEqualityAudit.groups.length,
    equalityConflicts:report.fullEqualityAudit.conflicts.length,
    unresolvedEqualityConflicts:report.fullEqualityAudit.conflicts.filter(group => group.remainingConflicts).length},null,2));
}

module.exports = {enumerateCases, auditConflicts, queriesForAnchors, buildAnalysis, buildTree, followTree, relationKey};
