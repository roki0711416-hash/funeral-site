const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sitemap = require('../patches/sitemap-lib.js');

test('カタログギフトは1,210円のままで、1万円無料の対象外', () => {
  global.window = global;
  delete require.cache[require.resolve('../patches/production/js/shipping-calc.js')];
  require('../patches/production/js/shipping-calc.js');
  const calc = global.HenreiyaShipping || global.HenreiyaShippingCalc;
  assert.ok(calc, 'shipping calculator did not load');
  const catalog = { id: 'cat-1', name: 'カタログ', price: 20000, categoryId: 'catalog', category: 'カタログギフト', supplierId: 's', storage: 'ambient' };
  const normal = { id: 'n-1', name: '菓子', price: 10000, categoryId: 'wagashi', category: '和菓子', supplierId: 's', storage: 'ambient' };
  const supplier = { id: 's', name: '返礼屋', rates: { 神奈川県: 880 }, undeliverable: [] };
  const onlyCatalog = calc.quote({ prefecture: '神奈川県', items: [{ id: 'cat-1', qty: 1 }], products: [catalog], suppliers: [supplier] });
  assert.equal(onlyCatalog.shippingTotal, 1210);
  assert.equal(onlyCatalog.freeShipping, false);
  const withNormal = calc.quote({
    prefecture: '神奈川県',
    items: [{ id: 'cat-1', qty: 1 }, { id: 'n-1', qty: 1 }],
    products: [catalog, normal],
    suppliers: [supplier],
  });
  assert.equal(withNormal.parcels.find((parcel) => parcel.catalogGift).fee, 1210);
  assert.equal(withNormal.parcels.find((parcel) => !parcel.catalogGift).fee, 0);
  const terms = fs.readFileSync(path.join(__dirname, '..', 'patches', 'production', 'terms.html'), 'utf8');
  assert.match(terms, /カタログギフト以外の商品合計が税込10,000円以上/);
  assert.match(terms, /カタログギフトは一律1,210円（税込）で、この無料条件の対象外です/);
});

test('サイトマップは公開ドメインと公開商品だけ', () => {
  const xml = sitemap.buildSitemap({
    origin: 'https://henreiya.vercel.app',
    products: [
      { id: 'C001-001', published: true },
      { id: 'hidden', published: false },
      { id: 'C001-002', published: true },
      { id: '', published: true },
    ],
  });
  assert.match(xml, /<loc>https:\/\/henreiya\.vercel\.app\/shop\.html<\/loc>/);
  assert.match(xml, /<loc>https:\/\/henreiya\.vercel\.app\/product\.html\?id=C001-001<\/loc>/);
  assert.match(xml, /<loc>https:\/\/henreiya\.vercel\.app\/product\.html\?id=C001-002<\/loc>/);
  assert.equal(xml.includes('hidden'), false);
  assert.equal(xml.includes('/cart.html'), false);
  assert.equal(xml.includes('/checkout.html'), false);
  assert.equal(xml.includes('/admin/'), false);
  assert.throws(() => sitemap.buildSitemap({ origin: 'https://example.com', products: [] }));
  const file = fs.readFileSync(path.join(__dirname, '..', 'patches', 'production', 'sitemap.xml'), 'utf8');
  assert.match(file, /<loc>https:\/\/henreiya\.vercel\.app\/index\.html<\/loc>/);
  assert.equal(file.includes('siteOrigin が未設定'), false);
  const count = (file.match(/<loc>/g) || []).length;
  assert.ok(count >= sitemap.STATIC_PAGES.length);
});
