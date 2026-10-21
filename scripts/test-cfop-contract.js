const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const glue = fs.readFileSync(path.join(root, 'public/cube_cross_solve.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'webpack.config.js'), 'utf8');
for (const name of ['cfop_start_js', 'cfop_stages_js', 'cfop_auto_f2l_js', 'cfop_verify_js']) {
  assert.match(glue, new RegExp(`export function ${name}\\b`), `${name} WASM export`);
}
for (const file of ['public/cube_cross_solve_bg.wasm', 'public/joint_table.bin', 'dist/cube_cross_table.bin']) {
  assert.ok(fs.statSync(path.join(root, file)).size > 0, `${file} exists and is nonempty`);
}
for (const name of ['cfop_search_worker.js', 'cfop_timeline_worker.js']) {
  const file = path.join(root, 'public', name);
  assert.ok(fs.existsSync(file), `${name} source exists`);
  assert.match(fs.readFileSync(file, 'utf8'), /postMessage\(\{\s*id[, :]/, `${name} replies by id`);
  assert.ok(config.includes(`public/${name}`), `${name} copied by webpack`);
}
console.log('CFOP WASM exports, resources and Worker contracts verified');
