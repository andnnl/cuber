/** Explicit maintenance command: fetch and validate a third-party snapshot, then bundle it for offline use. */
const fs = require('node:fs');
const path = require('node:path');

const URL = 'https://cuberoot.me/api/alg/snapshot/3x3/adv-f2l';
const output = path.join(__dirname, '../src/vue/AdvancedF2L/data.json');

async function main() {
  const response = await fetch(URL);
  if (!response.ok) throw Error(`下载非标 F2L 快照失败：HTTP ${response.status}`);
  const snapshot = await response.json();
  if (!Array.isArray(snapshot.cases)) throw Error('快照缺少 cases 数组');
  const errors = [];
  const ids = new Set();
  for (const [index, item] of snapshot.cases.entries()) {
    const label = `案例 ${index + 1} (${item?.name || '?'})`;
    if (!Number.isInteger(item?.id) || ids.has(item.id)) errors.push(`${label}：缺少或重复 ID`);
    ids.add(item?.id);
    if (typeof item?.name !== 'string' || !item.name || typeof item.setup !== 'string' ||
        typeof item.subgroup !== 'string' || typeof item.sticker?.fl !== 'string')
      errors.push(`${label}：基本字段缺失`);
    if (!Array.isArray(item.algs) || item.algs.length !== 4 || !Array.isArray(item.oriNames) || item.oriNames.length !== 4)
      errors.push(`${label}：不是四方向`);
    for (const [direction, variants] of (item.algs || []).entries()) {
      if (!Array.isArray(variants)) { errors.push(`${label} 方向 ${direction}：不是公式数组`); continue; }
      for (const variant of variants) {
        if (typeof variant.alg !== 'string' || !variant.alg || typeof variant.altId !== 'string' || !variant.altId)
          errors.push(`${label} 方向 ${direction}：公式或 altId 缺失`);
      }
    }
  }
  const variants = snapshot.cases.reduce((sum, item) => sum + item.algs.flat().length, 0);
  const empty = snapshot.cases.flatMap(item => item.algs.map((group, direction) =>
    group.length ? null : `${item.name}/${item.oriNames[direction]}`).filter(Boolean));
  if (snapshot.cases.length !== 54 || variants !== 598) errors.push(`数量变化：${snapshot.cases.length} 案例、${variants} 条公式`);
  console.log(`快照：${snapshot.cases.length} 案例、${variants} 条公式；空方向：${empty.join('、') || '无'}`);
  if (errors.length) throw Error(errors.join('\n'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`导入完成：${output}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
