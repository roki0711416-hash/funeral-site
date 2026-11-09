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
  assert.equal(source.includes('cacheHasRows'), false);
  assert.match(source, /cached\.products\.length > 0/);
});

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    dump: data,
  };
}

function loadCatalog(storage, fetchImpl) {
  global.window = global;
  global.localStorage = storage;
  global.sessionStorage = storage;
  global.location = { pathname: '/admin/products.html' };
  global.fetch = fetchImpl;
  const file = path.join(__dirname, '..', 'patches', 'production', 'js', 'catalog-store.js');
  delete require.cache[require.resolve(file)];
  require(file);
  return global.HenreiyaCatalog;
}

function jsonResponse(status, body, etag) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get(name) { return String(name).toLowerCase() === 'etag' ? etag || null : null; } },
    json: async () => body,
  };
}

test('商品が空の管理キャッシュは表示にも 304 にも使わず、本体の商品を出す', async () => {
  const storage = memoryStorage({
    henreiya_admin_catalog_v1: JSON.stringify({
      etag: '"catalog-v-live"',
      products: [],
      categories: [
        { id: 'wagashi', name: '和菓子' },
        { id: 'western', name: '洋菓子' },
      ],
      suppliers: [],
    }),
  });
  let seenHeaders = null;
  const catalog = loadCatalog(storage, async (url, opts) => {
    seenHeaders = opts.headers || {};
    if (seenHeaders['If-None-Match']) {
      return jsonResponse(304, null, '"catalog-v-live"');
    }
    return jsonResponse(200, {
      ok: true,
      products: [{ id: 'C004-014', name: '箱', price: 1620, categoryId: 'wagashi', image: 'data:image/webp;base64,QQ' }],
      categories: [{ id: 'wagashi', name: '和菓子' }, { id: 'western', name: '洋菓子' }],
      suppliers: [],
    }, '"catalog-v-live"');
  });
  assert.equal(catalog.primeAdminCache(), false);
  const result = await catalog.refresh();
  assert.equal(result.ok, true);
  assert.equal(seenHeaders['If-None-Match'], undefined);
  assert.equal(catalog.getProducts(true).length, 1);
  assert.equal(catalog.getProducts(true)[0].id, 'C004-014');
  const stored = JSON.parse(storage.getItem('henreiya_admin_catalog_v1'));
  assert.equal(stored.products.length, 1);
  assert.equal(stored.products[0].image, 'data:image/webp;base64,QQ');
});

test('巨大応答の JSON が読めないとき、空キャッシュのまま成功にしない', async () => {
  const storage = memoryStorage({
    henreiya_admin_catalog_v1: JSON.stringify({
      etag: '"catalog-v-live"',
      products: [],
      categories: [{ id: 'wagashi', name: '和菓子' }, { id: 'western', name: '洋菓子' }],
      suppliers: [],
    }),
  });
  const catalog = loadCatalog(storage, async () => ({
    status: 200,
    ok: true,
    headers: { get() { return '"catalog-v-live"'; } },
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
  }));
  assert.equal(catalog.primeAdminCache(), false);
  const result = await catalog.refresh();
  assert.equal(result.ok, false);
  assert.equal(catalog.getProducts(true).length, 0);
  assert.equal(storage.getItem('henreiya_admin_catalog_v1'), null);
  assert.match(result.error, /空の一覧では上書きしません/);
});

test('読込失敗でも、既にメモリにある商品は消さない', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const catalog = loadCatalog(storage, async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse(200, {
        ok: true,
        products: [{ id: 'C158-066', name: '保持', price: 13200, categoryId: 'wagashi', image: 'data:image/webp;base64,KEEP' }],
        categories: [{ id: 'wagashi', name: '和菓子' }],
        suppliers: [],
      });
    }
    return {
      status: 200,
      ok: true,
      headers: { get() { return null; } },
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    };
  });
  const first = await catalog.refresh();
  assert.equal(first.ok, true);
  const second = await catalog.refresh();
  assert.equal(second.ok, false);
  assert.equal(catalog.getProducts(true).map((item) => item.id).join(','), 'C158-066');
  assert.equal(catalog.getProducts(true)[0].image, 'data:image/webp;base64,KEEP');
});

test('商品がある控えだけを 304 で再表示する', async () => {
  const product = { id: 'C024-013', name: '保持', price: 1000, categoryId: 'wagashi', image: 'data:image/webp;base64,KEEP' };
  const storage = memoryStorage({
    henreiya_admin_catalog_v1: JSON.stringify({
      etag: '"live"',
      products: [product],
      categories: [{ id: 'wagashi', name: '和菓子' }],
      suppliers: [],
    }),
  });
  let seen = null;
  const catalog = loadCatalog(storage, async (url, opts) => {
    seen = opts.headers || {};
    return jsonResponse(304, null, '"live"');
  });
  assert.equal(catalog.primeAdminCache(), true);
  assert.equal(catalog.getProducts(true)[0].image, 'data:image/webp;base64,KEEP');
  const result = await catalog.refresh();
  assert.equal(result.ok, true);
  assert.equal(result.unchanged, true);
  assert.equal(seen['If-None-Match'], '"live"');
  assert.equal(catalog.getProducts(true)[0].id, 'C024-013');
});

test('管理画面は読込失敗を空の商品一覧として描かない', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'patches', 'production', 'admin', 'products.html'), 'utf8');
  assert.match(html, /catalog-store\.js\?v=20261109a/);
  assert.match(html, /label\.textContent = '読み込めません'/);
  assert.match(html, /esc\(message\)/);
  assert.doesNotMatch(
    html.slice(html.indexOf('HenreiyaCatalog.refresh()')),
    /if \(!hadCache\) notify/
  );
});
