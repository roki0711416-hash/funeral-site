const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('不完全な一覧応答は空の成功として採用しない', () => {
  global.window = global;
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.sessionStorage = global.localStorage;
  global.location = { pathname: '/admin/products.html' };
  const file = path.join(__dirname, '..', 'patches', 'production', 'js', 'catalog-store.js');
  delete require.cache[require.resolve(file)];
  require(file);
  const usable = global.HenreiyaCatalog.catalogResponseUsable;
  assert.equal(usable({}), false);
  assert.equal(usable(null), false);
  assert.equal(usable({ ok: true }), false);
  assert.equal(usable({ ok: false, products: [], categories: [] }), false);
  assert.equal(usable({ ok: true, products: [], categories: [] }), true);
  assert.equal(usable({ ok: true, products: [{ id: 'C159-010' }], categories: [{ id: 'bedding' }] }), true);
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /if \(!res\.ok \|\| !catalogResponseUsable\(loaded\)\)/);
  assert.match(source, /cache: 'no-store'/);
  assert.equal(source.includes('loaded = {}'), false);
});
