/* 2026別冊版を1件ずつ共有スプレッドシートへ追加する。写真は空、公開しない。 */
const fs = require('fs');
const path = require('path');

function sheetsWebAppUrl() {
  const fromEnv = String(process.env.SHEETS_WEB_APP_URL || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const text = fs.readFileSync(path.join(__dirname, '../js/local-config.js'), 'utf8');
    const matched = text.match(/WEB_APP_URL:\s*'([^']*)'/);
    return matched ? matched[1].trim() : '';
  } catch (err) {
    return '';
  }
}

const WEB_APP_URL = sheetsWebAppUrl();
if (!WEB_APP_URL) {
  console.error('SHEETS_WEB_APP_URL が未設定です。js/local-config.js を用意してください。');
  process.exit(1);
}
const CATEGORY_ID = 'cat-2026-bessatsu';
const source = JSON.parse(fs.readFileSync('/tmp/bessatsu-products.json', 'utf8'));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sheetsGet(params) {
  const query = new URLSearchParams(params);
  query.set('_', String(Date.now()));
  const res = await fetch(WEB_APP_URL + '?' + query.toString(), { cache: 'no-store' });
  const data = await res.json();
  if (!data || data.ok === false) throw new Error((data && data.error) || 'get failed');
  return data;
}

async function sheetsPost(body) {
  const res = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json();
  if (!data || data.ok === false) throw new Error((data && data.error) || 'post failed');
  return data;
}

async function saveRow(rowId, record) {
  const item = {
    ...record,
    id: rowId,
    status: 'catalog',
    createdAt: record.createdAt || new Date().toISOString(),
  };
  try {
    await sheetsPost({ action: 'update', type: 'inquiries', id: rowId, patch: item });
  } catch (err) {
    if (!/not found/i.test(String(err && err.message))) throw err;
    await sheetsPost({ action: 'create', type: 'inquiries', item });
  }
}

async function main() {
  const listed = await sheetsGet({ action: 'list', type: 'inquiries' });
  const items = listed.items || [];
  const existingApps = new Set();
  const existingIds = new Set();
  let hasCategory = false;
  items.forEach((row) => {
    if (!row || row.status !== 'catalog' || !row.catalog) return;
    if (row.catalogKind === 'category' && row.catalog.id === CATEGORY_ID) hasCategory = true;
    if (row.catalogKind === 'product') {
      existingIds.add(String(row.catalog.id));
      if (row.catalog.applicationNo) existingApps.add(String(row.catalog.applicationNo));
    }
  });
  const before = items.filter((row) => row && row.catalogKind === 'product').length;
  console.log('existing products', before, 'category', hasCategory);
  const kept = items.filter(
    (row) => row && row.catalogKind === 'product' && row.catalog && !String(row.catalog.id).startsWith('b2026-')
  );
  if (kept.length < 20) {
    throw new Error('元の商品が足りないため中断しました。' + kept.length);
  }

  if (!hasCategory) {
    const now = new Date().toISOString();
    const category = {
      id: CATEGORY_ID,
      name: '2026別冊版',
      image: 'images/product-catalog.jpg',
      priceFrom: Math.min(...source.items.map((item) => Number(item.price) || 0)),
      sortOrder: 20,
      createdAt: now,
      updatedAt: now,
    };
    await saveRow('catalog-c-' + CATEGORY_ID, {
      name: '（カテゴリ）2026別冊版',
      message: 'カテゴリカタログです。お問い合わせではありません。',
      catalogKind: 'category',
      catalog: category,
      createdAt: now,
    });
    console.log('category created');
  }

  const shard = Number(process.env.SHARD || 0);
  const shards = Number(process.env.SHARDS || 1);
  const queue = source.items.filter((_, index) => index % shards === shard);
  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of queue) {
    if (existingApps.has(item.applicationNo) || existingIds.has(item.id)) {
      skipped += 1;
      continue;
    }
    const now = new Date().toISOString();
    const product = {
      ...item,
      categoryId: CATEGORY_ID,
      category: '2026別冊版',
      image: '',
      published: false,
      featured: false,
      supplierId: '',
      bundleKey: '',
      shippingIncluded: false,
      createdAt: now,
      updatedAt: now,
    };
    const record = {
      name: '（商品）' + product.name,
      message: '商品カタログです。お問い合わせではありません。',
      catalogKind: 'product',
      catalog: product,
      createdAt: now,
    };
    let ok = false;
    let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await saveRow('catalog-p-' + product.id, record);
        ok = true;
        break;
      } catch (err) {
        lastError = String(err && err.message ? err.message : err);
        await sleep(800 * attempt);
      }
    }
    if (ok) {
      added += 1;
      if (added % 25 === 0 || added === 1) {
      const line = 'added ' + added + ' ' + product.applicationNo + ' ' + product.name;
      console.log(line);
      fs.appendFileSync('/tmp/bessatsu-import.log', line + '\n');
    }
    } else {
      failed += 1;
      console.error('FAIL', product.applicationNo, lastError);
    }
    await sleep(40);
  }
  const summary = JSON.stringify({ before, added, skipped, failed, webSkipped: source.skipped.length });
  console.log(summary);
  fs.appendFileSync('/tmp/bessatsu-import.log', summary + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
