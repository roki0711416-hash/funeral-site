const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const assign = require('../patches/category-assign.js');

function product(extra) {
  return Object.assign({
    id: 'C048-017',
    applicationNo: 'C048-017',
    name: 'ティータイムBOX',
    price: 1080,
    categoryId: 'unclassified',
    category: '未分類',
    published: true,
    image: 'data:image/webp;base64,ONE',
    images: ['data:image/webp;base64,ONE'],
  }, extra || {});
}

test('カテゴリだけ変わり、写真と他の項目が同じときだけ成功', () => {
  const before = product();
  const after = product({ categoryId: 'western', category: '洋菓子・スイーツ' });
  const result = assign.assessCategorySave(before, after, 'western');
  assert.equal(result.ok, true);
  assert.equal(result.retry, false);
  const payload = assign.categoryOnlyPayload(before, { id: 'western', name: '洋菓子・スイーツ' });
  assert.equal(payload.categoryId, 'western');
  assert.equal(payload.image, before.image);
  assert.deepEqual(payload.images, before.images);
  assert.equal(payload.name, before.name);
  assert.equal(payload.price, before.price);
});

test('C048-017 のようにカテゴリが未分類のままなら成功にせず再送しない', () => {
  const before = product();
  const after = product();
  const result = assign.assessCategorySave(before, after, 'western');
  assert.equal(result.ok, false);
  assert.equal(result.retry, false);
  assert.match(result.reason, /カテゴリは保存されていません/);
  assert.match(result.reason, /自動では再送しません/);
});

test('写真の枚数が変わったら成功にしない', () => {
  const before = product();
  const after = product({
    categoryId: 'western',
    category: '洋菓子・スイーツ',
    image: 'data:image/webp;base64,TWO',
    images: ['data:image/webp;base64,ONE', 'data:image/webp;base64,TWO'],
  });
  const result = assign.assessCategorySave(before, after, 'western');
  assert.equal(result.ok, false);
  assert.match(result.reason, /写真が変わった/);
});

test('商品名が変わったら成功にしない', () => {
  const before = product();
  const after = product({ categoryId: 'western', category: '洋菓子・スイーツ', name: '別の名前' });
  const result = assign.assessCategorySave(before, after, 'western');
  assert.equal(result.ok, false);
  assert.match(result.reason, /商品名または価格/);
});

test('管理画面はカテゴリ専用ボタンを持ち、写真登録の保護は残す', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'patches', 'production', 'admin', 'products.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'patches', 'category-assign.js'), 'utf8');
  assert.equal(html.includes(source), true);
  assert.match(html, /data-category-p=/);
  assert.match(html, /assessCategorySave\(/);
  assert.equal(html.includes('saved && saved.galleryOnly'), true);
  const photo = fs.readFileSync(path.join(__dirname, '..', 'patches', 'photo-import.js'), 'utf8');
  assert.equal(html.includes(photo), true);
});
