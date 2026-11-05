const fs = require('node:fs');
const { enumerateCases, auditConflicts, queriesForAnchors } = require('./pll6-scan-analysis.cjs');

function equalityQuestions() {
  const questions = [];
  for (let position = 2; position <= 6; position++) for (let reference = 1; reference < position; reference++)
    questions.push({kind:'same', a:reference, b:position});
  return questions;
}

function shape(sample, start) {
  const colors = sample.six.slice(start, start + 3);
  if (colors[0] === colors[1] && colors[1] === colors[2]) return '团';
  if (colors[0] === colors[2]) return '眼';
  if (colors[0] === colors[1]) return '棒左';
  if (colors[1] === colors[2]) return '棒右';
  return '灯';
}

function answerFor(sample, question) {
  if (question.kind === 'shape') return shape(sample, question.a - 1);
  if (question.kind === 'match') return Array.from({length:question.b - 1}, (_, index) => index + 1)
    .filter(position => sample.six[position - 1] === sample.six[question.b - 1]).join('=') || '新色';
  if (question.kind === 'mask') return [4,5,6]
    .filter(position => sample.six[position - 1] === sample.six[question.a - 1]).join('=') || '无';
  const relation = sample.relations[question.a - 1][question.b - 1];
  return question.kind === 'same' ? (relation === '同' ? '同' : '异') : relation;
}

function equalityFirstTree(cases, budget, options = {}) {
  const pairs = equalityQuestions();
  const questions = [...pairs];
  if (options.shapes) questions.push({kind:'shape', a:1, b:3}, {kind:'shape', a:4, b:6});
  if (options.matches) for (let position = 4; position <= 6; position++) questions.push({kind:'match', a:1, b:position});
  if (options.masks) for (let reference = 1; reference <= 3; reference++) questions.push({kind:'mask', a:reference, b:6});
  const cache = new Map();
  const minimum = options.monotonic === false ? 0 : 2;
  function search(samples, remaining, cursor, root = false, neighborPhase = false) {
    const names = [...new Set(samples.map(sample => sample.name))];
    if (names.length === 1) return {kind:'leaf', target:names[0], total:0, worst:0, neighborTotal:0};
    if (remaining <= 0 || names.length > (options.masks ? 8 : options.matches ? 6 : options.shapes ? 5 : 2) ** remaining) return null;
    const key = `${remaining}:${cursor}:${root}:${neighborPhase}:${samples.map(sample => sample.id).join('|')}`;
    if (cache.has(key)) return cache.get(key);
    let best = null;
    function consider(question, partitions, final) {
      if (partitions.size < 2) return;
      const branches = {};
      for (const [answer, subset] of partitions) {
        const branch = final && !options.neighborSuffix
          ? new Set(subset.map(sample => sample.name)).size === 1
            ? {kind:'leaf', target:subset[0].name, total:0, worst:0, neighborTotal:0} : null
          : search(subset, remaining - 1, options.monotonic === false ? 0 : question.b, false, final);
        if (!branch) return;
        branches[answer] = branch;
      }
      const children = Object.values(branches);
      const total = samples.length + children.reduce((sum, child) => sum + child.total, 0);
      const worst = 1 + Math.max(...children.map(child => child.worst));
      const neighborTotal = (final ? samples.length : 0) + children.reduce((sum, child) => sum + child.neighborTotal, 0);
      const score = [total, neighborTotal, worst, question.b, question.a];
      if (!best || score.some((value, index) => value < best.score[index] &&
        score.slice(0,index).every((prior, offset) => prior === best.score[offset])))
        best = {...question, branches, total, worst, neighborTotal, score};
    }
    for (const question of questions) {
      if (neighborPhase) continue;
      if (question.b < cursor || (root && options.leftFirst && !(question.kind === 'shape' && question.a === 1))) continue;
      const partitions = new Map();
      for (const sample of samples) {
        const answer = answerFor(sample, question);
        if (!partitions.has(answer)) partitions.set(answer, []);
        partitions.get(answer).push(sample);
      }
      consider(question, partitions, false);
    }
    if (!root) for (const pair of pairs) {
      if (pair.b < cursor || samples.some(sample => answerFor(sample, {...pair, kind:'neighbor'}) === '同')) continue;
      const question = {...pair, kind:'neighbor'};
      const partitions = new Map();
      for (const sample of samples) {
        const answer = answerFor(sample, question);
        if (!partitions.has(answer)) partitions.set(answer, []);
        partitions.get(answer).push(sample);
      }
      consider(question, partitions, true);
    }
    cache.set(key, best);
    return best;
  }
  return search(cases, budget, minimum, true);
}

function followEqualityTree(tree, sample) {
  const steps = [];
  let current = tree;
  while (current && current.kind !== 'leaf') {
    const answer = answerFor(sample, current);
    steps.push({kind:current.kind, a:current.a, b:current.b, answer});
    current = current.branches[answer];
  }
  return {target:current?.target || null, steps};
}

function analyzeEqualityFirst(cases = enumerateCases()) {
  const settings = [
    {id:'pairs-forward', title:'逐对同色优先，最后一次邻色，严格单向', monotonic:true},
    {id:'pairs-memory', title:'逐对同色优先，最后一次邻色，允许比较已记颜色', monotonic:false},
    {id:'suffix-forward', title:'先逐对同色，再进入邻色收尾阶段，严格单向', monotonic:true, neighborSuffix:true},
    {id:'shapes-forward', title:'左侧五形态起步，再同色，最后邻色（认形按一步）', shapes:true, leftFirst:true, monotonic:true},
    {id:'matching-forward', title:'左侧认形，右侧逐格认同色组，最后邻色（认组按一步）', shapes:true, matches:true, leftFirst:true, monotonic:true},
    {id:'color-masks', title:'左侧认形，右侧找整组同色位置，最后邻色（认组按一步）', shapes:true, matches:true, masks:true, leftFirst:true, monotonic:true},
  ];
  return settings.map(setting => {
    const attempts = [];
    let tree = null;
    for (let budget = 0; budget <= 10; budget++) {
      tree = equalityFirstTree(cases, budget, setting);
      attempts.push({budget, feasible:!!tree});
      if (tree) break;
    }
    if (!tree) throw Error(`${setting.id} 未找到树`);
    const routes = cases.map(sample => ({id:sample.id, name:sample.name, auf:sample.auf, six:sample.six,
      ...followEqualityTree(tree, sample)}));
    const histogram = {};
    for (const route of routes) histogram[route.steps.length] = (histogram[route.steps.length] || 0) + 1;
    return {...setting, attempts, worst:tree.worst, total:tree.total, mean:tree.total / cases.length,
      neighborChecks:tree.neighborTotal, neighborCases:routes.filter(route => route.steps.some(step => step.kind === 'neighbor')).length,
      histogram, conflicts:routes.filter(route => route.target !== route.name), tree, routes};
  });
}

function equalityPattern(sample) {
  const seen = [];
  return [...sample.six].map(color => {
    if (!seen.includes(color)) seen.push(color);
    return String.fromCharCode(65 + seen.indexOf(color));
  }).join('');
}

function groupedEquality(cases = enumerateCases()) {
  const groups = new Map();
  for (const sample of cases) {
    const pattern = equalityPattern(sample);
    if (!groups.has(pattern)) groups.set(pattern, []);
    groups.get(pattern).push(sample);
  }
  const pairs = queriesForAnchors([1,2,3]);
  return [...groups].map(([pattern, samples]) => {
    const names = [...new Set(samples.map(sample => sample.name))].sort();
    const question = names.length === 1 ? null : [...pairs].sort((first, second) => second.b - first.b || second.a - first.a).find(pair =>
      samples.every(sample => answerFor(sample, {...pair, kind:'neighbor'}) !== '同') &&
      auditConflicts(samples, [pair]).conflicts.length === 0);
    if (names.length > 1 && !question) throw Error(`同色模式仍冲突 ${pattern}`);
    const rules = names.length === 1 ? [] : ['对','邻'].map(answer => ({answer,
      names:[...new Set(samples.filter(sample => answerFor(sample, {...question, kind:'neighbor'}) === answer)
        .map(sample => sample.name))]}));
    return {pattern, names, question, rules, cases:samples.length, ids:samples.map(sample => sample.id)};
  }).sort((first, second) => first.pattern.localeCompare(second.pattern));
}

function stepText(step) {
  if (step.kind === 'shape') return `${step.a}～${step.b}认形：${step.answer}`;
  if (step.kind === 'match') return `第${step.b}格同色归组：${step.answer}`;
  if (step.kind === 'mask') return `右三格找第${step.a}格同色：${step.answer}`;
  return `${step.a}–${step.b}${step.kind === 'same' ? '是否同色' : '邻/对消歧'}：${step.answer}`;
}

function markdown(results, groups) {
  const direct = groups.filter(group => group.names.length === 1);
  const conflicts = groups.filter(group => group.names.length > 1);
  const groupCases = collection => collection.reduce((sum, group) => sum + group.cases, 0);
  return ['# PLL 六格：同色优先，邻色最后', '',
    '## 本轮范围与结论', '',
    '- 重新枚举 21 个 PLL × 4 个 U 朝向，共 84 例；没有更改界面或旧九大类。',
    '- 同色问题为二元“同/异”。只有候选案例都已保证该对不同色时，才允许“邻/对”消歧，不把同/对/邻三分问题冒充一次同色判断。',
    '- 每条路径必须先问同色；“最后一次邻色”方案仅允许一个邻/对问题且必须直接到叶节点。“邻色收尾阶段”允许多个邻/对问题，但不再回到同色。',
    '- 搜索目标仍先最小化最坏次数，再最小化 84 例等权总次数；只对列出的题型集合和限制有效。',
    '- 严格逐对同色优先未把最坏次数降到 4；最多需要 8 次。二元树区分 21 个 PLL 的理论下界本身就是 5，具体题型和顺序限制又可能提高这个下界。',
    '- 把“认五种形态”“当前格属于哪个同色组”“右边哪些位置是某色”当成整组视觉识别，可减少学习步骤，但这些是多格判断，不能声称等于一次两格比较。', '',
    '| 方案 | 最多步骤/比较 | 平均 | 分布 | 使用邻/对的案例 | 冲突 |',
    '|---|---:|---:|---|---:|---:|',
    ...results.map(result => `| ${result.title} | ${result.worst} | ${result.mean.toFixed(4)} | ${Object.entries(result.histogram).map(([size,count]) => `${size}次:${count}`).join('；')} | ${result.neighborCases} | ${result.conflicts.length} |`), '',
    '## 更适合教学的同色分组法', '',
    '1. 左侧 1、2、3 只分五种同色形态：团、眼、棒左、棒右、灯，不先判断邻色或对色。',
    '2. 继续读 4、5、6，归入前面已记住的颜色组；新颜色另记一组。组名 A/B/C/D 只表示相同关系，不表示固定颜色。',
    '3. 根据完整同色分布查表：能确定 PLL 就停止；仅剩两个名称的模式，最后补一次指定两格的“邻/对”判断。', '',
    `- 共 ${groups.length} 种完整同色模式，${direct.length} 种直接确定 PLL（覆盖 ${groupCases(direct)}/84 例）。`,
    `- 另 ${conflicts.length} 种模式仍有跨 PLL 冲突（覆盖 ${groupCases(conflicts)}/84 例），每种恰好补一次邻/对就能消歧；补完后 0 冲突。`,
    '- 最后消歧统一落在第 6 格：优先 5–6，其次 4–6，特殊情况 2–6；第 2 格使用已读颜色记忆，不要求重新看左面。',
    '- 上面是三段观察流程，不是“全部三次两格比较”。第二段本身包含颜色归组和记忆；本轮不将它替换进界面，以免造成虚假的次数减少。',
    '- 整组识别方案中的当前格序号不下降，但右三格整组查询可能再次使用已经读过的位置：它假定记忆中保留颜色，不保证人类实际眼动不回看。', '',
    '## 同色仍冲突的模式与最后一问', '',
    '| 同色模式（123 / 456） | 候选 | 最后比较 | 对色 | 邻色 | 朝向数 |',
    '|---|---|---|---|---|---:|',
    ...conflicts.map(group => `| ${group.pattern.slice(0,3)} / ${group.pattern.slice(3)} | ${group.names.join('/')} | ${group.question.a}–${group.question.b} | ${group.rules.find(rule => rule.answer === '对').names.join('/')} | ${group.rules.find(rule => rule.answer === '邻').names.join('/')} | ${group.cases} |`), '',
    '## 全部同色模式', '', '| 模式 | PLL | 朝向数 |', '|---|---|---:|',
    ...groups.map(group => `| ${group.pattern.slice(0,3)} / ${group.pattern.slice(3)} | ${group.names.join('/')} | ${group.cases} |`), '',
    ...results.flatMap(result => [`## ${result.title}：84 条路径`, '', '| PLL | AUF | 六格 | 次数 | 路径 |', '|---|---|---|---:|---|',
      ...result.routes.map(route => `| ${route.name} | ${route.auf} | ${route.six} | ${route.steps.length} | ${route.steps.map(stepText).join(' → ')} |`), '']),
    '## 复现', '', '```bash', 'npx tsc -p tsconfig.ble.json', 'node scripts/test-pll6-equality-first.cjs', 'node scripts/pll6-equality-first.cjs', '```', '',
  ].join('\n');
}

if (require.main === module) {
  const results = analyzeEqualityFirst();
  const groups = groupedEquality();
  fs.writeFileSync('docs/analysis/pll6-equality-first.json', JSON.stringify({results, groups}, null, 2) + '\n');
  fs.writeFileSync('docs/analysis/pll6-equality-first.md', markdown(results, groups));
  console.log(JSON.stringify(results.map(({tree,routes,...summary}) => summary), null, 2));
}
module.exports = {equalityQuestions, equalityFirstTree, followEqualityTree, analyzeEqualityFirst, answerFor, groupedEquality, equalityPattern};
