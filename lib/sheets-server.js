/* 注文API用。公開ページと同じスプレッドシートを読む。
   URLは環境変数 SHEETS_WEB_APP_URL、または Git に含めない js/local-config.js から取る。 */
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

async function sheetsGet(params) {
  const query = new URLSearchParams(params || {});
  query.set('_', String(Date.now()));
  const res = await fetch(WEB_APP_URL + '?' + query.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('sheet get failed');
  const data = await res.json();
  if (!data || data.ok === false) throw new Error((data && data.error) || 'sheet get failed');
  return data;
}

async function sheetsPost(body) {
  const res = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data || data.ok === false) throw new Error((data && data.error) || 'sheet post failed');
  return data;
}

function catalogFromInquiries(items) {
  const products = [];
  const suppliers = [];
  const deleted = { products: [], suppliers: [] };
  (items || []).forEach((row) => {
    if (!row || row.status !== 'catalog') return;
    if (row.catalogKind === 'product' && row.catalog && row.catalog.id) products.push(row.catalog);
    if (row.catalogKind === 'supplier' && row.catalog && row.catalog.id) suppliers.push(row.catalog);
    if (row.catalogKind === 'deleted' && row.deleted) {
      deleted.products = Array.isArray(row.deleted.products) ? row.deleted.products.map(String) : [];
      deleted.suppliers = Array.isArray(row.deleted.suppliers) ? row.deleted.suppliers.map(String) : [];
    }
  });
  const removedProducts = new Set(deleted.products);
  const removedSuppliers = new Set(deleted.suppliers);
  return {
    products: products.filter((item) => item && !removedProducts.has(String(item.id))),
    suppliers: suppliers.filter((item) => item && !removedSuppliers.has(String(item.id))),
  };
}

async function loadCatalog() {
  const data = await sheetsGet({ action: 'list', type: 'inquiries' });
  return catalogFromInquiries(data.items || []);
}

async function createOrder(order) {
  const data = await sheetsPost({ action: 'create', type: 'orders', item: order });
  return data.item || order;
}

module.exports = { loadCatalog, createOrder };
