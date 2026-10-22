const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
assert.match(read('src/ble/app-route.ts'), /"cfop"/);
assert.match(read('src/vue/AppShell/index.ts'), /cfop: CfopLearning/);
assert.match(read('src/vue/Setting/index.html'), /tap\('cfop'\)/);
const template = read('src/vue/CfopLearning/index.html');
for (const title of ['随机打乱', '搜索首阶段', '一键求解', '返回起点', '上一步', '下一步', '播放', '开始跟练'])
  assert.ok(template.includes(title), title);
for (const option of ['自动十字', '自动 F2L']) assert.ok(template.includes(option), option);
assert.match(template, /<button @click="newScramble">随机打乱<\/button>\s*<button @click="applyInputScramble">按公式打乱<\/button>\s*<\/div>\s*<div class="cfop-row">\s*<label><input data-cfop-bottom-z2/);
assert.match(read('src/vue/CfopLearning/index.ts'), /newScramble\(\)/);
assert.match(template, /v-for="segment in route\.segments"/);
assert.match(read('src/vue/CfopLearning/theme.ts'), /overflow-wrap:\s*anywhere/);
console.log('CFOP page controls and route available');
