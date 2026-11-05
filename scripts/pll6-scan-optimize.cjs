const fs = require('node:fs');
const path = require('node:path');
const {enumerateCases, queriesForAnchors, buildAnalysis, followTree, relationKey} = require('./pll6-scan-analysis.cjs');

function boundedTree(cases,queries,budget,options = {}) {
  const cache = new Map();
  function search(samples,cursor,remaining) {
    if (new Set(samples.map(sample => sample.name)).size === 1)
      return {kind:'leaf',target:samples[0].name,count:samples.length,total:0,worst:0,nodes:0,crossCost:0};
    if (remaining <= 0 || new Set(samples.map(sample => sample.name)).size > 3 ** remaining) return null;
    if (options.maxDepthById && samples.some(sample => options.maxDepthById[sample.id] <= budget - remaining)) return null;
    const key = `${cursor}:${remaining}:${samples.map(sample => sample.id).sort().join('|')}`;
    if (cache.has(key)) return cache.get(key);
    const gatePending = options.leftGate && new Set(samples.map(sample => sample[options.leftGate])).size > 1;
    let best = null;
    for (const query of queries) {
      if (query.b < cursor || (gatePending && query.b > 3)) continue;
      const partitions = new Map();
      for (const sample of samples) {
        const answer = relationKey(sample,[query]);
        if (!partitions.has(answer)) partitions.set(answer,[]);
        partitions.get(answer).push(sample);
      }
      if (partitions.size < 2) continue;
      const branches = {};
      let feasible = true;
      for (const [answer,subset] of partitions) {
        const branch = search(subset,query.b,remaining-1);
        if (!branch) { feasible = false; break; }
        branches[answer] = branch;
      }
      if (!feasible) continue;
      const children = Object.values(branches);
      const total = samples.length + children.reduce((sum,child) => sum + child.total,0);
      const worst = 1 + Math.max(...children.map(child => child.worst));
      const nodes = 1 + children.reduce((sum,child) => sum + child.nodes,0);
      const crossCost = (query.a <= 3 && query.b >= 4 ? samples.length : 0) +
        children.reduce((sum,child) => sum + child.crossCost,0);
      const score = [total,worst,nodes,crossCost,query.b,query.b-query.a];
      if (!best || score.some((value,index) => value < best.score[index] &&
        score.slice(0,index).every((prior,offset) => prior === best.score[offset])))
        best = {kind:'question',...query,count:samples.length,total,worst,nodes,crossCost,score,branches};
    }
    cache.set(key,best);
    return best;
  }
  return search(cases,options.startAt || 2,budget);
}

function optimizeAnalysis(cases = enumerateCases()) {
  const previous = buildAnalysis(cases);
  const queries = queriesForAnchors([1,2,3]);
  const settings = [
    {mode:'left-ten',title:'先分左侧 10 类，再识别（联合优化）',leftGate:'leftKey'},
    {mode:'left-five',title:'先分左侧 5 种形态，再按需细分',leftGate:'left'},
    {mode:'adaptive',title:'不强制先分类，直接单向判别',leftGate:null},
    {mode:'no-regression',title:'保守精简：每例都不比原路径长',leftGate:null,
      maxDepthById:Object.fromEntries(previous.routes.map(route => [route.id,route.path.length]))},
  ];
  const strategies = settings.map(setting => {
    const attempts = [];
    let tree = null;
    for (let budget = 0; budget <= previous.metrics.worstComparisons; budget++) {
      tree = boundedTree(cases,queries,budget,setting);
      attempts.push({budget,feasible:!!tree});
      if (tree) break;
    }
    if (!tree) throw Error(`${setting.title} 没有找到可行树`);
    const routes = cases.map(sample => ({id:sample.id,name:sample.name,auf:sample.auf,six:sample.six,
      ...followTree(tree,sample)}));
    const failures = routes.filter(route => route.target !== route.name ||
      route.path.some((step,index) => index && step.b < route.path[index-1].b));
    return {...setting,tree,attempts,routes,failures,total:tree.total,worst:tree.worst,
      mean:tree.total / cases.length,nodes:tree.nodes,
      histogram:Object.fromEntries(Array.from({length:tree.worst+1}, (_,count) =>
        [count,routes.filter(route => route.path.length === count).length]).filter(([,count]) => count)),
      improved:routes.filter(route => route.path.length < previous.routes.find(old => old.id === route.id).path.length)
        .map(route => ({id:route.id,before:previous.routes.find(old => old.id === route.id).path.length,after:route.path.length})),
      worsened:routes.filter(route => route.path.length > previous.routes.find(old => old.id === route.id).path.length)
        .map(route => ({id:route.id,before:previous.routes.find(old => old.id === route.id).path.length,after:route.path.length}))};
  });
  return {cases,baseline:{worst:previous.metrics.worstComparisons,
    total:previous.routes.reduce((sum,route) => sum + route.path.length,0),mean:previous.metrics.meanComparisons,
    histogram:Object.fromEntries([1,2,3,4,5].map(count => [count,previous.routes.filter(route => route.path.length === count).length]).filter(([,count]) => count))},
    strategies};
}

function treeLines(tree,indent = '') {
  if (tree.kind === 'leaf') return [`${indent}→ ${tree.target}`];
  const lines = [`${indent}第 ${tree.b} 格与记住的第 ${tree.a} 格比较`];
  for (const answer of ['同','对','邻']) if (tree.branches[answer])
    lines.push(`${indent}  ${answer}色：`,...treeLines(tree.branches[answer],`${indent}    `));
  return lines;
}

function markdown(report) {
  const shortest = report.strategies.find(strategy => strategy.mode === 'adaptive');
  const text = route => route.path.map(step => `${step.a}–${step.b}${step.answer}`).join(' → ');
  return ['# PLL 六格单向路径：进一步精简搜索', '',
    '## 搜索条件与结论', '',
    '- 数据仍为 21 个 PLL × 4 个方向的 84 例；每例等权，只要求识别 PLL，不要求区分对称方向。',
    '- 允许全部 15 对格子的同色/对色/邻色三分判断；当前观察格只能从小到大，参照格使用已读颜色记忆。',
    '- 同一当前格可以比较多个参照。一次三分关系判断计 1 次，不等价于人类眼动、二元问题次数或实际用时。',
    '- 即使某个早期格没有立即提出问题，也要暂存其颜色，例如先比较 2–3，随后在第 5 格比较 1–5，不代表重新回看第 1 格。',
    '- 最优目标先最小化最坏比较数，再在这个最坏次数上限内最小化 84 例总比较数；同分再按子树实际深度、节点数、跨面比较数排序。',
    '- 每个状态保存候选案例、当前观察格和剩余深度；枚举所有有效问题及各结果分支。严格变小的候选集避免重复提问。',
    '- 本次按统一剩余深度预算搜索，允许较容易分支使用富余预算来降低平均次数，不再对子分支独立优先最小化最坏次数。',
    '', '| 方案 | 最多次数 | 总次数 / 84 | 平均次数 | 路径长度分布 | 错判/回头 |', '|---|---:|---:|---:|---|---:|',
    `| 原方案：左侧 10 类分阶段优化 | ${report.baseline.worst} | ${report.baseline.total} | ${report.baseline.mean.toFixed(4)} | ${Object.entries(report.baseline.histogram).map(([depth,count]) => `${depth}次：${count}例`).join('；')} | 0 |`,
    ...report.strategies.map(strategy => `| ${strategy.title} | ${strategy.worst} | ${strategy.total} | ${strategy.mean.toFixed(4)} | ${Object.entries(strategy.histogram).map(([depth,count]) => `${depth}次：${count}例`).join('；')} | ${strategy.failures.length} |`),
    '', '## 最少次数证据与边界', '',
    ...report.strategies.map(strategy => `- ${strategy.title}：${strategy.attempts.map(attempt => `${attempt.budget}次${attempt.feasible ? '可行' : '不可行'}`).join('；')}。`),
    '- 最少性仅限上述 84 例、允许的问题集合、单向顺序和单位成本模型，不覆盖颜色组整体识别、图形记忆、不同难度权重或任意人类识别方法。',
    '- 所有候选问题中的同/对/邻分支都参与搜索；不改变真值标签，不把同一 PLL 的重复方向误算为冲突。',
    '', '## 不强制分类时的精简树', '', '```text',...treeLines(shortest.tree),'```',
    '', '## 84 例的精简路径', '', '| PLL | AUF | 六格 | 次数 | 从左到右的比较 |', '|---|---|---|---:|---|',
    ...shortest.routes.map(route => `| ${route.name} | ${route.auf} | ${route.six} | ${route.path.length} | ${text(route)} |`),
    '', '## 各方案变化', '',
    ...report.strategies.flatMap(strategy => [`### ${strategy.title}`, '',
      `比原路径更短 ${strategy.improved.length} 例，更长 ${strategy.worsened.length} 例。平均更短不意味着每个案例都更短。`, '',
      ...strategy.improved.map(change => `- 缩短 ${change.id}：${change.before} → ${change.after} 次。`),
      ...strategy.worsened.map(change => `- 变长 ${change.id}：${change.before} → ${change.after} 次。`), '']),
    '## 重算', '', '`npm run analyze:pll-scan` 同时生成原始分析和本报告；`npm run test:pll-scan` 验证两套分析。', ''].join('\n');
}

function writeReport(output = 'docs/analysis') {
  const report = optimizeAnalysis();
  if (report.strategies.some(strategy => strategy.failures.length)) throw Error('精简路径仍有错判或逆序');
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'pll6-shortest-paths.json'),`${JSON.stringify(report,null,2)}\n`);
  fs.writeFileSync(path.join(output,'pll6-shortest-paths.md'),markdown(report));
  console.log(JSON.stringify({baseline:report.baseline,strategies:report.strategies.map(({mode,worst,total,mean,histogram,attempts,improved,worsened}) =>
    ({mode,worst,total,mean,histogram,attempts,improved:improved.length,worsened:worsened.length}))},null,2));
  return report;
}

function writeRuntimeCatalog(destination = 'src/ble/pll-six-scan-catalog.ts') {
  const report = optimizeAnalysis();
  const tree = report.strategies.find(strategy => strategy.mode === 'adaptive').tree;
  const nodes = [];
  function pack(node) {
    if (node.kind === 'leaf') return node.target;
    const index = nodes.length;
    nodes.push(null);
    nodes[index] = [node.a,node.b,...['同','对','邻'].map(answer => node.branches[answer] ? pack(node.branches[answer]) : null)];
    return index;
  }
  pack(tree);
  const cases = report.cases.map(sample => [sample.name,sample.auf,sample.six]);
  fs.writeFileSync(destination,[
    'export type PllScanNode = readonly [number, number, number | string | null, number | string | null, number | string | null];',
    'export const PLL_SCAN_TREE: readonly PllScanNode[] = [',
    ...nodes.map(node => `  ${JSON.stringify(node)},`), '];',
    'export const PLL_SCAN_CASES: readonly (readonly [string, string, string])[] = [',
    ...cases.map(sample => `  ${JSON.stringify(sample)},`), '];', '',
  ].join('\n'));
}

if (require.main === module) {
  if (process.argv[2] === '--catalog') writeRuntimeCatalog();
  else writeReport(process.argv[2]);
}
module.exports = {boundedTree,optimizeAnalysis,writeReport,writeRuntimeCatalog};
