const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'patches', 'production', 'css');
const sp = fs.readFileSync(path.join(root, 'sp.css'), 'utf8');
const pc = fs.readFileSync(path.join(root, 'pc.css'), 'utf8');
const base = fs.readFileSync('/tmp/henreiya-layout/css__base.css', 'utf8');

test('スマホではLINEボタンを残し、カテゴリと商品詳細がボタン幅だけ右に避ける', () => {
  assert.match(base, /\.line-float\s*\{[^}]*position:\s*fixed/);
  assert.match(sp, /@media \(max-width: 767px\)/);
  assert.match(sp, /\.line-float\s*\{[^}]*width:\s*52px/);
  const block = sp.slice(sp.lastIndexOf('@media (max-width: 767px)'));
  assert.match(block, /padding-bottom:\s*calc\(52px \+ 1\.35rem/);
  assert.match(block, /\.cat-grid,\s*\.product-grid,\s*\.rank-row,\s*\.product-detail\s*\{[^}]*padding-right:\s*3\.35rem/);
  assert.equal(block.includes('display: none'), false);
});

test('768px以上もLINEボタンは残し、同じ余白だけ空ける', () => {
  const block = pc.slice(pc.lastIndexOf('@media (min-width: 768px)'));
  assert.match(block, /padding-bottom:\s*calc\(56px \+ 1\.5rem/);
  assert.match(block, /padding-right:\s*3\.5rem/);
  assert.equal(block.includes('.line-float'), false);
});
