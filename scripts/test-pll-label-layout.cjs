const assert = require('node:assert/strict');
const { layoutPllLabels } = require('../.tmp/pll-overlay/label-layout');
const overlaps = (first, second) => first.left < second.left + second.width + 4 &&
  first.left + first.width + 4 > second.left && first.top < second.top + second.height + 4 &&
  first.top + first.height + 4 > second.top;
const labels = [
  {key:'same1',text:'A 组同色',x:150,y:140},
  {key:'same2',text:'A 组同色',x:150,y:140},
  {key:'same3',text:'B 组同色',x:158,y:142},
  {key:'final',text:'最后·邻色',x:158,y:142},
  {key:'count',text:'除去第1、6格剩余三色',x:155,y:135},
];
for (const width of [280,360,390,1280]) for (const height of [200,447]) {
  const result = layoutPllLabels(labels,width,height);
  assert.equal(result.length,labels.length);
  assert.deepEqual(result,layoutPllLabels(labels,width,height), '布局应稳定，不能随机跳动');
  for (const [index,label] of result.entries()) {
    assert.ok(label.left >= 4 && label.top >= 4);
    assert.ok(label.left + label.width <= width - 4 && label.top + label.height <= height - 4);
    assert.ok(label.lines.length >= 1);
    for (const other of result.slice(0,index)) assert.equal(overlaps(label,other),false, `重叠 ${label.key}/${other.key}`);
  }
}
const edges = layoutPllLabels([{key:'left',text:'同色',x:-20,y:-20},
  {key:'right',text:'邻色',x:1000,y:1000}],360,200);
assert.equal(edges.length,2);
assert.ok(edges.every(label => label.left >= 4 && label.top >= 4 && label.left + label.width <= 356 && label.top + label.height <= 196));
const wrapped = layoutPllLabels([{key:'long',text:'这是一个需要自动换行的很长的颜色分组说明，用来验证窄屏不会裁切文字',x:100,y:100}],140,200);
assert.ok(wrapped[0].lines.length > 1);
assert.deepEqual(layoutPllLabels(labels,0,200),[]);
console.log('PLL 覆层文字：密集标签避让、边界约束、长文字换行与稳定布局：通过');
