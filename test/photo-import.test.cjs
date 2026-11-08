const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const importer = require('../patches/photo-import.js');

function file(name, sha, order) {
  return { name: name, sha256: sha, order: order };
}

function product(id, extra) {
  return Object.assign({
    id: id,
    applicationNo: id,
    name: '商品' + id,
    price: 1620,
    categoryId: 'wagashi',
    category: '和菓子',
    published: true,
    featured: false,
    note: 'そのまま',
  }, extra || {});
}

test('SKU_01 がメインになり、番号順をファイル名の辞書順にしない', () => {
  const products = [product('C004-014')];
  const plan = importer.planPhotoImport({
    products: products,
    files: [
      file('C004-014_10.jpg', 'aaa', 10),
      file('C004-014_02.jpg', 'bbb', 2),
      file('C004-014_01.jpg', 'ccc', 1),
    ],
  });
  assert.equal(plan.ready, true);
  assert.equal(plan.jobs.length, 1);
  assert.deepEqual(plan.jobs[0].files.map((item) => item.order), [1, 2, 10]);
  assert.equal(plan.jobs[0].files[0].sha256, 'ccc');
  assert.equal(plan.jobs[0].id, 'C004-014');
});

test('a/b、11枚以上、不明、複数一致は保存対象にしない', () => {
  const products = [
    product('C010-001'),
    product('C010-002', { applicationNo: 'DUP-01' }),
    product('C010-003', { applicationNo: 'DUP-01' }),
  ];
  const plan = importer.planPhotoImport({
    products: products,
    files: [
      file('C004-014a_01.jpg', 'a', 1),
      file('C004-014_01.jpg', 'b', 1),
      file('C010-001_01.jpg', 'c', 1),
      file('C010-001_11.jpg', 'd', 11),
      file('C099-999_01.jpg', 'e', 1),
      file('DUP-01_01.jpg', 'f', 1),
      file('readme.txt', 'g', 1),
      file('C010-004_02.jpg', 'h', 2),
    ],
  });
  const bySku = Object.fromEntries(plan.jobs.map((job) => [job.sku, job.action]));
  assert.equal(bySku['C004-014'], 'skip-ambiguous');
  assert.equal(bySku['C010-001'], 'skip-overlimit');
  assert.equal(bySku['C099-999'], 'skip-unmatched');
  assert.equal(bySku['DUP-01'], 'skip-multi');
  assert.equal(bySku['C010-004'], 'skip-no-main');
  assert.equal(plan.ignored.some((item) => item.name === 'readme.txt'), true);
  assert.equal(plan.ready, false);
});

test('保存済みと同一ハッシュは再保存せず、未完了だけ実行する', () => {
  const products = [product('C001-001'), product('C001-002'), product('C001-003')];
  const plan = importer.planPhotoImport({
    products: products,
    ledger: {
      version: 1,
      products: [
        { sku: 'C001-001', status: 'saved', files: [{ order: 1, name: 'C001-001_01.jpg', sha256: 'same' }] },
        { sku: 'C001-002', status: 'failed', files: [{ order: 1, name: 'C001-002_01.jpg', sha256: 'old' }] },
        { sku: 'C001-003', status: 'pending', files: [{ order: 1, name: 'C001-003_01.jpg', sha256: 'pend' }] },
      ],
    },
    files: [
      file('C001-001_01.jpg', 'same', 1),
      file('C001-002_01.jpg', 'old', 1),
      file('C001-003_01.jpg', 'pend', 1),
    ],
  });
  const bySku = Object.fromEntries(plan.jobs.map((job) => [job.sku, job.action]));
  assert.equal(bySku['C001-001'], 'skip-done');
  assert.equal(bySku['C001-002'], 'run');
  assert.equal(bySku['C001-003'], 'run');
});

test('登録済みファイルが変わっていたら自動では上書きしない', () => {
  const plan = importer.planPhotoImport({
    products: [product('C001-001')],
    ledger: {
      version: 1,
      products: [
        { sku: 'C001-001', status: 'saved', files: [{ order: 1, sha256: 'old', name: 'C001-001_01.jpg' }] },
      ],
    },
    files: [file('C001-001_01.jpg', 'new', 1)],
  });
  assert.equal(plan.jobs[0].action, 'skip-changed');
  assert.equal(plan.ready, false);
});

test('連続保存は不一致で止まり、未実行は未保存のまま台帳に残す', async () => {
  const products = [product('C002-001'), product('C002-002'), product('C002-003')];
  const calls = [];
  const result = await importer.executePhotoPlan({
    jobs: products.map((item) => ({
      sku: item.id,
      action: 'run',
      status: 'run',
      product: item,
      files: [{ order: 1, name: item.id + '_01.jpg', sha256: item.id }],
    })),
    prepare: async (job) => ['data:' + job.sku],
    saveProduct: async (payload) => {
      calls.push(payload.id);
      if (payload.id === 'C002-002') {
        return Object.assign({}, payload, { name: '別商品', images: payload.images, image: payload.image });
      }
      return payload;
    },
  });
  assert.deepEqual(calls, ['C002-001', 'C002-002']);
  assert.equal(result.stopped, true);
  assert.equal(result.jobs[0].status, 'saved');
  assert.equal(result.jobs[1].status, 'failed');
  assert.match(result.jobs[1].reason, /name/);
  assert.equal(result.jobs[2].status, 'pending');
  const ledger = importer.ledgerFromResults(result.jobs);
  assert.equal(ledger.products[2].status, 'pending');
  assert.equal(ledger.products[2].files[0].sha256, 'C002-003');
  assert.equal(JSON.stringify(ledger).includes('password'), false);
});

test('写真だけの送信は商品名・価格・区分・公開をコピーし、画像だけ差し替える', () => {
  const before = product('C003-001', { desc: '説明', supplierId: 'henreiya' });
  const payload = importer.photoOnlyPayload(before, ['data:main', 'data:sub']);
  assert.equal(payload.name, before.name);
  assert.equal(payload.price, before.price);
  assert.equal(payload.categoryId, before.categoryId);
  assert.equal(payload.published, true);
  assert.equal(payload.desc, '説明');
  assert.deepEqual(payload.images, ['data:main', 'data:sub']);
  assert.equal(payload.image, 'data:main');
  assert.equal(importer.nonPhotoIntact(before, payload).ok, true);
  assert.equal(importer.galleryOk(['data:main', 'data:sub'], payload), true);
});

test('読み戻しで写真順が違う保存結果は成功にしない', async () => {
  const item = product('C003-002');
  const result = await importer.executePhotoPlan({
    jobs: [{
      sku: item.id,
      action: 'run',
      product: item,
      files: [
        { order: 1, sha256: 'x', name: 'C003-002_01.jpg' },
        { order: 2, sha256: 'y', name: 'C003-002_02.jpg' },
      ],
    }],
    prepare: async () => ['data:box', 'data:cut'],
    saveProduct: async (payload) => Object.assign({}, payload, { image: 'data:cut', images: ['data:cut', 'data:box'] }),
  });
  assert.equal(result.jobs[0].status, 'failed');
  assert.match(result.jobs[0].reason, /順番/);
});

test('管理画面の本番ファイルに同じ振り分け関数がある', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'patches', 'production', 'admin', 'products.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'patches', 'photo-import.js'), 'utf8');
  assert.equal(html.includes('function planPhotoImport'), true);
  assert.equal(html.includes(source), true);
  assert.equal(html.includes('id="photo-import-run"'), true);
  assert.equal(html.includes('この内容で登録しますか'), false);
});
