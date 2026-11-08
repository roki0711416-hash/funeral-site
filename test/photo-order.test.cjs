const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const order = require('../patches/photo-order.js');

const PLACEHOLDER = 'images/product-catalog.jpg';

function isPlaceholder(src) {
  return src === PLACEHOLDER;
}

test('複数追加は渡した順を保ち、1枚ずつの unshift で逆順にしない', () => {
  const added = order.addPreparedImages([PLACEHOLDER], ['box', 'cutaway'], isPlaceholder);
  assert.deepEqual(added.images, ['box', 'cutaway', PLACEHOLDER]);
  assert.equal(added.skipped, 0);
});

test('実写真がすでにあるときは末尾に足し、既存のメインを動かさない', () => {
  const added = order.addPreparedImages(['kept-main', 'kept-sub'], ['next'], isPlaceholder);
  assert.deepEqual(added.images, ['kept-main', 'kept-sub', 'next']);
});

test('11枚目以降は捨て、重複は足さない', () => {
  const current = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const added = order.addPreparedImages(current, ['a', 'j', 'k', 'l'], isPlaceholder);
  assert.deepEqual(added.images, current.concat(['j']));
  assert.equal(added.skipped, 2);
});

test('長い data URL を写真未設定にしない', () => {
  const dataUrl = 'data:image/jpeg;base64,' + 'a'.repeat(3000);
  assert.equal(order.listPreviewSrc(dataUrl), dataUrl);
  assert.equal(order.listPreviewSrc('  '), '');
  assert.equal(order.rowPreviewSource({ image: '', images: ['', dataUrl] }), dataUrl);
});

test('ショップに出る id と申込番号だけを詳細で解決する', () => {
  const products = [
    { id: 'internal', applicationNo: 'C004-014', name: 'hidden', published: false, image: 'data:image/jpeg;base64,abc' },
    { id: 'C004-014', applicationNo: 'C004-014', name: 'monaka', published: true, image: 'data:image/jpeg;base64,box' },
    { id: 'C024-013', applicationNo: 'ALT-24', name: 'other', published: true, image: 'images/product-tea.jpg' },
    { id: 'no-photo', applicationNo: 'NO-PHOTO', name: 'empty', published: true, image: '' },
  ];
  assert.equal(order.findShopProduct(products, 'C004-014').name, 'monaka');
  assert.equal(order.findShopProduct(products, 'ALT-24').name, 'other');
  assert.equal(order.findShopProduct(products, 'NO-PHOTO'), null);
  assert.equal(order.findShopProduct(products, 'internal'), null);
});

test('管理画面に入れた追加関数も同じ順で並ぶ', () => {
  const admin = fs.readFileSync(path.join(__dirname, '..', 'patches', 'production', 'admin', 'products.html'), 'utf8');
  const start = admin.indexOf('function addPreparedImages');
  const end = admin.indexOf('function productRow');
  assert.ok(start > 0 && end > start);
  global.HenreiyaCatalog = { isPlaceholderImage: isPlaceholder };
  const addPreparedImages = new Function(admin.slice(start, end) + '\nreturn addPreparedImages;')();
  const added = addPreparedImages([PLACEHOLDER], ['box', 'cutaway']);
  assert.deepEqual(added.images, ['box', 'cutaway', PLACEHOLDER]);
});

test('カタログ詳細の解決関数はショップ公開条件を維持する', () => {
  const store = fs.readFileSync(path.join(__dirname, '..', 'patches', 'production', 'js', 'catalog-store.js'), 'utf8');
  const start = store.indexOf('function isShopVisible');
  const end = store.indexOf('async function loadProduct');
  assert.ok(start > 0 && end > start);
  const api = new Function(store.slice(start, end) + '\nreturn { isShopVisible, findShopProduct };')();
  const products = [
    { id: 'C004-014', published: true, image: 'data:image/jpeg;base64,box' },
    { id: 'secret', applicationNo: 'C004-014', published: false, image: 'data:image/jpeg;base64,x' },
  ];
  assert.equal(api.findShopProduct(products, 'C004-014').id, 'C004-014');
  assert.equal(api.isShopVisible(products[1]), false);
});

test('初期画像をメインにしても保存前の並べ替えで実写真に戻さない', () => {
  const store = fs.readFileSync(path.join(__dirname, '..', 'patches', 'production', 'js', 'catalog-store.js'), 'utf8');
  assert.equal(store.includes('if (!list.length) push(image);\n      return dedupeImages(list);'), true);
  assert.equal(store.includes('写真の順番は保存されていません'), true);
  assert.equal(store.includes('if (nextCustom.length) return next;'), true);
  const preset = 'images/product-sweets.jpg';
  const cutaway = 'data:image/webp;base64,CUTAWAY';
  global.window = global;
  global.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
  global.sessionStorage = global.localStorage;
  global.location = { pathname: '/shop.html' };
  delete require.cache[require.resolve('../patches/production/js/catalog-store.js')];
  require('../patches/production/js/catalog-store.js');
  const shown = global.HenreiyaCatalog.displayImage({
    image: preset,
    images: [preset, cutaway],
  });
  assert.equal(shown, preset);
});

test('公開詳細は保存したメイン画像を初期画像だからといって後ろへ回さない', () => {
  const seo = require('../patches/production/js/product-seo.js');
  const preset = 'images/product-sweets.jpg';
  const cutaway = 'data:image/webp;base64,CUTAWAY';
  const rendered = seo.render({
    id: 'C004-014',
    name: 'もなか合わせ',
    category: '和菓子',
    categoryId: 'wagashi',
    price: 1620,
    image: preset,
    images: [preset, cutaway],
  });
  assert.match(rendered.html, /id="product-gallery-main" src="images\/product-sweets.jpg"/);
  assert.ok(rendered.html.indexOf(preset) < rendered.html.indexOf(cutaway));
});

test('本番パッチは逆順 unshift と data URL の2048文字却下を外している', () => {
  const root = path.join(__dirname, '..', 'patches', 'production');
  const admin = fs.readFileSync(path.join(root, 'admin', 'products.html'), 'utf8');
  const store = fs.readFileSync(path.join(root, 'js', 'catalog-store.js'), 'utf8');
  assert.equal(admin.includes('gallery.unshift(result.display)'), false);
  assert.equal(admin.includes('value.length > 2048'), false);
  assert.equal(admin.includes('addPreparedImages(gallery, prepared)'), true);
  assert.equal(store.includes('findShopProduct'), true);
  assert.equal(store.includes("remote('GET', '/api/catalog')"), true);
  assert.equal(store.includes('galleryOnly'), true);
  assert.equal(store.includes("remote('POST', '/api/admin/products'"), true);
});
