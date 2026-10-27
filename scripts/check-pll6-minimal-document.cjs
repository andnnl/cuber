// Usage: playwright-cli run-code --filename scripts/audit-pll6-short-clues.js |
//   node scripts/check-pll6-minimal-document.cjs
const fs = require('fs');

const auditLine = fs.readFileSync(0, 'utf8').split('\n').find(line => line.startsWith('{"cases":'));
if (!auditLine) throw new Error('未收到六格枚举结果');
const audit = JSON.parse(auditLine);
const markdown = fs.readFileSync('docs/pll6-minimal-observation-features.md', 'utf8');
const rows = [...markdown.matchAll(/^\| (\d:[^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)]
  .map(([, key, shape, same, clues]) => ({ key, shape: shape.trim(), same: same.trim(), clues: clues.trim() }));
const opposite = { F: 'B', B: 'F', R: 'L', L: 'R' };
const relation = (six, a, b) => six[a - 1] === six[b - 1] ? '同'
  : opposite[six[a - 1]] === six[b - 1] ? '对' : '邻';

function matches(six, clue) {
  let parts;
  if ((parts = /^([1-6])＝([1-6])$/.exec(clue)))
    return relation(six, Number(parts[1]), Number(parts[2])) === '同';
  if ((parts = /^([1-6])≠([1-6])$/.exec(clue)))
    return relation(six, Number(parts[1]), Number(parts[2])) !== '同';
  if ((parts = /^([1-6])↔([1-6])(?:、([1-6]))?(对|邻)$/.exec(clue)))
    return [parts[2], parts[3]].filter(Boolean).every(b => relation(six, Number(parts[1]), Number(b)) === parts[4]);
  if (clue === '2↔4 与 3↔5 一组同色、一组对色')
    return [relation(six, 2, 4), relation(six, 3, 5)].sort().join('') === '同对';
  throw new Error(`无法解析条件：${clue}`);
}
function matchesESameGroup(six) {
  const first = relation(six, 1, 5) === '同' && relation(six, 2, 4) === '同';
  const second = relation(six, 2, 6) === '同' && relation(six, 3, 5) === '同';
  return first !== second;
}

const errors = [];
const clueCounts = [0, 0, 0, 0];
for (const row of rows) {
  const actual = audit.details.find(item => item.key === row.key);
  if (!actual) { errors.push(`未知行 ${row.key}`); continue; }
  if (actual.shape !== row.shape) errors.push(`${row.key} 形态不一致：${row.shape} / ${actual.shape}`);
  const clues = row.clues === '—' ? [] : row.clues.split('；').map(clue => clue.replaceAll('`', '').trim());
  const samePairs = new Set();
  for (const [chain] of row.same.matchAll(/[1-6](?:＝[1-6])+/g)) {
    const numbers = chain.split('＝').map(Number);
    for (let i = 0; i < numbers.length; i++) for (let j = i + 1; j < numbers.length; j++)
      samePairs.add([numbers[i], numbers[j]].sort((a, b) => a - b).join('-'));
  }
  for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) {
    const invariant = actual.six.every(six => relation(six, a, b) === '同');
    if (row.key !== '9:E' && invariant !== samePairs.has(`${a}-${b}`))
      errors.push(`${row.key} 同色格 ${a}＝${b} ${invariant ? '漏写' : '误写'}`);
  }
  if (row.key === '9:E' && (row.same !== '随 U 朝向互换：`1＝5`、`2＝4` / `2＝6`、`3＝5`' ||
    actual.six.some(six => {
      const first = relation(six, 1, 5) === '同' && relation(six, 2, 4) === '同';
      const second = relation(six, 2, 6) === '同' && relation(six, 3, 5) === '同';
      return first === second;
    })))
    errors.push('9:E 同色格的 U 朝向互换不一致');
  clueCounts[clues.length] = (clueCounts[clues.length] || 0) + 1;
  for (const six of actual.six)
    if (!(row.key !== '9:E' || matchesESameGroup(six)) || !clues.every(clue => matches(six, clue)))
      errors.push(`${row.key} 未涵盖自身：${six}`);
  const rivals = audit.details.filter(item => item.key !== row.key && item.shape === row.shape);
  for (const rival of rivals)
    for (const six of rival.six)
      if ((row.key !== '9:E' || matchesESameGroup(six)) && clues.every(clue => matches(six, clue)))
        errors.push(`${row.key} 与 ${rival.key} 撞型：${six}`);
  for (let i = 0; i < clues.length; i++)
    if (rivals.every(rival => rival.six.every(six => clues.some((clue, j) => j !== i && !matches(six, clue)))))
      errors.push(`${row.key} 的 ${clues[i]} 可删除，不是最少条件`);
}
const missing = audit.details.filter(item => !rows.some(row => row.key === item.key)).map(item => item.key);
if (audit.collisions?.length) errors.push(`完整关系签名存在跨行冲突：${JSON.stringify(audit.collisions)}`);
console.log(JSON.stringify({ states: audit.cases, signatures: audit.signatures, rows: rows.length, clueCounts, missing, errors }, null, 2));
if (audit.cases !== 84 || audit.signatures !== 71 || rows.length !== 65 || missing.length || errors.length)
  process.exitCode = 1;
