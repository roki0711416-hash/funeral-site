/* 商品・カテゴリカタログ — 共有スプレッドシートが唯一の保存先。表示用の控えはメモリだけ。 */
window.HenreiyaCatalog = (function () {
  'use strict';

  const KEYS = {
    categories: 'categories',
    products: 'products',
    suppliers: 'suppliers',
  };
  const memory = {
    products: [],
    categories: [],
    suppliers: [],
    deleted: { products: [], categories: [], suppliers: [] },
  };
  const LEGACY_KEYS = [
    'henreiya_products',
    'henreiya_categories',
    'henreiya_catalog_seeded_v1',
    'henreiya_catalog_ready',
    'henreiya_catalog_deleted',
    'henreiya_catalog_source',
    'henreiya_catalog_pushed_v1',
  ];

  function clearLegacyCache() {
    LEGACY_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        /* 保存先には使わない */
      }
    });
  }

  clearLegacyCache();

  function sheetsUrl() {
    const cfg = window.HenreiyaSheetsConfig || {};
    return (cfg.WEB_APP_URL || '').trim();
  }

  function sheetsEnabled() {
    return Boolean(sheetsUrl());
  }

  function read(key) {
    if (key === KEYS.products) return memory.products;
    if (key === KEYS.categories) return memory.categories;
    if (key === KEYS.suppliers) return memory.suppliers;
    return [];
  }

  function write(key, list) {
    const copy = Array.isArray(list) ? list.slice() : [];
    if (key === KEYS.products) memory.products = copy;
    else if (key === KEYS.categories) memory.categories = copy;
    else if (key === KEYS.suppliers) memory.suppliers = copy;
  }

  function uid(prefix) {
    return (
      prefix +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function seed() {
    clearLegacyCache();
  }

  function ensureSeed() {
    clearLegacyCache();
  }

  const ROW = {
    product: 'catalog-p-',
    category: 'catalog-c-',
    supplier: 'catalog-s-',
    deleted: 'catalog-deleted',
    ready: 'catalog-ready',
  };
  let fresh = false;
  let epoch = 0;

  function bump() {
    epoch += 1;
  }

  function sheetsErrorMessage(err) {
    const raw = String((err && err.message) || err || '');
    if (/invalid type/i.test(raw)) {
      return 'スプレッドシートが商品の保存を受け付けませんでした。';
    }
    if (/failed to fetch|network|load/i.test(raw)) {
      return 'スプレッドシートに接続できませんでした。通信状況を確認してもう一度保存してください。';
    }
    if (/大きすぎ/i.test(raw)) return raw;
    if (!raw || raw === 'sheets post failed' || raw === 'sheets get failed') {
      return 'スプレッドシートへの保存に失敗しました。';
    }
    return raw;
  }

  async function sheetsGet(params) {
    const base = sheetsUrl();
    if (!base) throw new Error('スプレッドシートの接続先が設定されていません。');
    const q = new URLSearchParams(params).toString();
    let res;
    try {
      res = await fetch(base + (base.includes('?') ? '&' : '?') + q + '&_=' + Date.now(), {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
      });
    } catch (err) {
      throw new Error(sheetsErrorMessage(err));
    }
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error('スプレッドシートからの応答を読み取れませんでした。');
    }
    if (!data || data.ok === false) {
      throw new Error(sheetsErrorMessage(new Error((data && data.error) || 'sheets get failed')));
    }
    return data;
  }

  async function sheetsPost(body) {
    const base = sheetsUrl();
    if (!base) throw new Error('スプレッドシートの接続先が設定されていません。');
    const payload = JSON.stringify(body);
    if (payload.length > 49000) {
      throw new Error('画像が大きすぎてスプレッドシートに保存できません。別の写真を選んでください。');
    }
    let res;
    try {
      res = await fetch(base, {
        method: 'POST',
        redirect: 'follow',
        cache: 'no-store',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
      });
    } catch (err) {
      throw new Error(sheetsErrorMessage(err));
    }
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error('スプレッドシートからの応答を読み取れませんでした。');
    }
    if (!data || data.ok === false) {
      if (body.action === 'delete' && data && data.deleted === false) return data;
      const error = new Error((data && data.error) || 'sheets post failed');
      throw new Error(sheetsErrorMessage(error));
    }
    return data;
  }

  function seedCategories() {
    const seedData = window.HenreiyaCatalogSeed || {};
    return (seedData.categories || []).map((c, i) => ({
      ...c,
      sortOrder: c.sortOrder || i + 1,
    }));
  }

  function seedProducts() {
    const seedData = window.HenreiyaCatalogSeed || {};
    const products = (seedData.products || []).map((p, i) => ({
      ...p,
      published: p.published !== false,
      featured: !!p.featured,
      sortOrder: p.sortOrder || i + 1,
    }));
    const ranks = (seedData.rankings && seedData.rankings.all) || [];
    ranks.forEach((id, idx) => {
      const product = products.find((item) => item.id === id);
      if (!product) return;
      product.featured = true;
      product.sortOrder = idx + 1;
    });
    return products;
  }

  function readDeleted() {
    return {
      products: memory.deleted.products.slice(),
      categories: memory.deleted.categories.slice(),
      suppliers: (memory.deleted.suppliers || []).slice(),
    };
  }

  function writeDeleted(deleted) {
    memory.deleted = {
      products: (deleted && deleted.products ? deleted.products : []).map(String),
      categories: (deleted && deleted.categories ? deleted.categories : []).map(String),
      suppliers: (deleted && deleted.suppliers ? deleted.suppliers : []).map(String),
    };
  }

  function upsertById(list, item) {
    const id = String(item.id);
    const index = list.findIndex((row) => row && String(row.id) === id);
    if (index >= 0) list[index] = item;
    else list.push(item);
  }

  function catalogFromInquiries(items) {
    const products = [];
    const categories = [];
    const suppliers = [];
    const deleted = { products: [], categories: [], suppliers: [] };
    let ready = false;
    (items || []).forEach((row) => {
      if (!row || row.status !== 'catalog') return;
      if (row.id === ROW.ready || row.catalogKind === 'ready') ready = true;
      if (row.catalogKind === 'product' && row.catalog && row.catalog.id) {
        upsertById(products, row.catalog);
      } else if (row.catalogKind === 'category' && row.catalog && row.catalog.id) {
        upsertById(categories, row.catalog);
      } else if (row.catalogKind === 'supplier' && row.catalog && row.catalog.id) {
        upsertById(suppliers, row.catalog);
      } else if (row.catalogKind === 'deleted' && row.deleted) {
        deleted.products = Array.isArray(row.deleted.products) ? row.deleted.products.map(String) : [];
        deleted.categories = Array.isArray(row.deleted.categories)
          ? row.deleted.categories.map(String)
          : [];
        deleted.suppliers = Array.isArray(row.deleted.suppliers) ? row.deleted.suppliers.map(String) : [];
      }
    });
    return { products, categories, suppliers, deleted, ready };
  }

  function applyRemote(remote) {
    const removedProducts = new Set(remote.deleted.products || []);
    const removedCategories = new Set(remote.deleted.categories || []);
    const removedSuppliers = new Set(remote.deleted.suppliers || []);
    write(
      KEYS.products,
      remote.products.filter((item) => item && !removedProducts.has(String(item.id)))
    );
    write(
      KEYS.categories,
      remote.categories.filter((item) => item && !removedCategories.has(String(item.id)))
    );
    write(
      KEYS.suppliers,
      (remote.suppliers || []).filter((item) => item && !removedSuppliers.has(String(item.id)))
    );
    writeDeleted(remote.deleted);
    fresh = true;
    clearLegacyCache();
  }

  async function bootstrapSheet(remote) {
    const removedProducts = new Set(remote.deleted.products || []);
    const removedCategories = new Set(remote.deleted.categories || []);
    const haveProducts = new Set(remote.products.map((item) => String(item.id)));
    const haveCategories = new Set(remote.categories.map((item) => String(item.id)));
    for (const category of seedCategories()) {
      if (removedCategories.has(String(category.id)) || haveCategories.has(String(category.id))) continue;
      await persistInquiry(ROW.category + category.id, catalogRecord('category', category));
    }
    for (const product of seedProducts()) {
      if (removedProducts.has(String(product.id)) || haveProducts.has(String(product.id))) continue;
      await persistInquiry(ROW.product + product.id, catalogRecord('product', product));
    }
    if (!remote.ready) {
      await persistInquiry(ROW.ready, {
        name: '（システム）商品カタログ',
        message: '商品カタログの初期化記録です。お問い合わせではありません。',
        catalogKind: 'ready',
      });
    }
  }

  async function loadRemote() {
    const data = await sheetsGet({ action: 'list', type: 'inquiries' });
    return catalogFromInquiries(data.items);
  }

  async function refresh() {
    const token = ++epoch;
    fresh = false;
    if (!sheetsEnabled()) {
      return { ok: false, source: 'none', error: 'スプレッドシートの接続先が設定されていません。' };
    }
    try {
      let remote = await loadRemote();
      if (token !== epoch) return { ok: true, source: 'sheets' };
      if (!remote.ready) {
        await bootstrapSheet(remote);
        if (token !== epoch) return { ok: true, source: 'sheets' };
        remote = await loadRemote();
        if (token !== epoch) return { ok: true, source: 'sheets' };
      }
      applyRemote(remote);
      return { ok: true, source: 'sheets' };
    } catch (err) {
      if (token !== epoch) return { ok: true, source: 'sheets' };
      fresh = false;
      write(KEYS.products, []);
      write(KEYS.categories, []);
      write(KEYS.suppliers, []);
      writeDeleted({ products: [], categories: [], suppliers: [] });
      clearLegacyCache();
      console.warn('[HenreiyaCatalog] refresh failed', err);
      return { ok: false, source: 'none', error: sheetsErrorMessage(err) };
    }
  }

  async function persistInquiry(rowId, record) {
    const item = {
      ...record,
      id: rowId,
      status: 'catalog',
      createdAt: record.createdAt || nowISO(),
    };
    try {
      await sheetsPost({
        action: 'update',
        type: 'inquiries',
        id: rowId,
        patch: item,
      });
    } catch (err) {
      if (!/not found/i.test(String(err && err.message))) throw err;
      await sheetsPost({ action: 'create', type: 'inquiries', item });
    }
  }

  async function persistDeleted(deleted) {
    await persistInquiry(ROW.deleted, {
      name: '（システム）削除済み商品',
      message: '商品カタログの削除記録です。お問い合わせではありません。',
      catalogKind: 'deleted',
      deleted: {
        products: deleted.products || [],
        categories: deleted.categories || [],
        suppliers: deleted.suppliers || [],
      },
    });
    writeDeleted(deleted);
  }

  async function pushAllToSheets() {
    if (!sheetsEnabled()) return;
    const cats = getCategories(true);
    const prods = getProducts(true);
    for (const c of cats) {
      try {
        await sheetsPost({ action: 'create', type: 'categories', item: c });
      } catch (e) {
        console.warn(e);
      }
    }
    for (const p of prods) {
      try {
        await sheetsPost({ action: 'create', type: 'products', item: p });
      } catch (e) {
        console.warn(e);
      }
    }
  }

  function sortCats(list) {
    return list.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  function sortProds(list) {
    return list.slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  function getCategories(includeEmpty) {
    return sortCats(read(KEYS.categories));
  }

  function getProducts(includeUnpublished) {
    let list = sortProds(read(KEYS.products));
    if (!includeUnpublished) {
      list = list.filter((p) => p.published !== false && String(p.image || '').trim());
    }
    return list;
  }

  function getCategory(id) {
    return getCategories(true).find((c) => c.id === id) || null;
  }

  function getProduct(id) {
    return getProducts(true).find((p) => p.id === id) || null;
  }

  function recalcCategoryPriceFrom(categoryId) {
    const prods = getProducts(true).filter(
      (p) => p.categoryId === categoryId && p.published !== false
    );
    if (!prods.length) return;
    const min = Math.min(...prods.map((p) => Number(p.price) || 0));
    const cats = read(KEYS.categories);
    const i = cats.findIndex((c) => c.id === categoryId);
    if (i >= 0) {
      cats[i].priceFrom = min;
      write(KEYS.categories, cats);
    }
  }

  function catalogRecord(kind, item) {
    const label = kind === 'product' ? '商品' : kind === 'supplier' ? '仕入れ先' : 'カテゴリ';
    return {
      name: '（' + label + '）' + (item.name || ''),
      message: label + 'カタログです。お問い合わせではありません。',
      catalogKind: kind,
      catalog: item,
      createdAt: item.createdAt,
    };
  }

  async function forgetDeleted(kind, id) {
    const deleted = readDeleted();
    const key = kind === 'product' ? 'products' : kind === 'supplier' ? 'suppliers' : 'categories';
    if (deleted[key].indexOf(String(id)) < 0) return;
    deleted[key] = deleted[key].filter((value) => value !== String(id));
    await persistDeleted(deleted);
  }

  async function rememberDeleted(kind, id) {
    const deleted = readDeleted();
    const key = kind === 'product' ? 'products' : kind === 'supplier' ? 'suppliers' : 'categories';
    if (!deleted[key]) deleted[key] = [];
    if (deleted[key].indexOf(String(id)) < 0) deleted[key].push(String(id));
    await persistDeleted(deleted);
  }

  async function saveCategory(data) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('カテゴリ名を入力してください。');
    bump();
    const list = read(KEYS.categories);
    const now = nowISO();
    let item;
    const existing = data.id && list.some((c) => c.id === data.id);
    if (existing) {
      const i = list.findIndex((c) => c.id === data.id);
      item = { ...list[i], ...data, name, updatedAt: now };
    } else {
      item = {
        id: data.id || uid('cat'),
        name,
        image: data.image || 'images/cat-western.jpg',
        priceFrom: Number(data.priceFrom) || 0,
        sortOrder: Number(data.sortOrder) || list.length + 1,
        createdAt: now,
      };
    }
    await persistInquiry(ROW.category + item.id, catalogRecord('category', item));
    await forgetDeleted('category', item.id);
    fresh = true;
    const next = read(KEYS.categories);
    const index = next.findIndex((c) => c.id === item.id);
    if (index >= 0) next[index] = item;
    else next.push(item);
    write(KEYS.categories, next);
    return item;
  }

  async function deleteCategory(id) {
    bump();
    const used = getProducts(true).some((p) => p.categoryId === id);
    if (used) throw new Error('このカテゴリを使う商品があるため削除できません');
    await sheetsPost({ action: 'delete', type: 'inquiries', id: ROW.category + id });
    await rememberDeleted('category', id);
    write(
      KEYS.categories,
      read(KEYS.categories).filter((c) => c.id !== id)
    );
  }

  async function saveProduct(data) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('商品名を入力してください。');
    if (!data.categoryId) throw new Error('カテゴリを選択してください。');
    if (data.price === '' || data.price == null || Number.isNaN(Number(data.price))) {
      throw new Error('価格を入力してください。');
    }
    const image = String(data.image || '').trim();
    bump();
    const list = read(KEYS.products);
    const now = nowISO();
    const cat = getCategory(data.categoryId);
    const existing = data.id && list.some((p) => p.id === data.id);
    const prev = existing ? list.find((p) => p.id === data.id) : null;
    const item = {
      ...(prev || {}),
      ...data,
      id: existing ? data.id : data.id || uid('p'),
      name,
      applicationNo: String(data.applicationNo || '').trim(),
      categoryId: data.categoryId,
      category: cat ? cat.name : data.category || (prev && prev.category) || '',
      price: Number(data.price) || 0,
      priceExTax:
        data.priceExTax === '' || data.priceExTax == null || Number.isNaN(Number(data.priceExTax))
          ? ''
          : Number(data.priceExTax),
      shelfLife: String(data.shelfLife || '').trim(),
      contents: String(data.contents || '').trim(),
      boxSize: String(data.boxSize || '').trim(),
      quantityText: String(data.quantityText || '').trim(),
      threeSize: String(data.threeSize || '').trim(),
      deliverySize: String(data.deliverySize || '').trim(),
      noshiSize: String(data.noshiSize || '').trim(),
      supplierId: String(data.supplierId || '').trim(),
      storage: data.storage === 'chilled' || data.storage === 'frozen' ? data.storage : 'ambient',
      bundleKey: String(data.bundleKey || '').trim(),
      shippingIncluded: !!data.shippingIncluded,
      image,
      imageOriginal:
        typeof data.imageOriginal === 'string'
          ? data.imageOriginal
          : (prev && prev.imageOriginal) || '',
      desc: data.desc != null ? String(data.desc) : (prev && prev.desc) || '',
      sortOrder: Number(data.sortOrder) || (prev && prev.sortOrder) || list.length + 1,
      published: image ? data.published !== false : false,
      featured: !!data.featured,
      createdAt: (prev && prev.createdAt) || now,
      updatedAt: now,
    };
    if (item.imageOriginal && JSON.stringify(item).length > 45000) {
      item.imageOriginal = '';
    }
    await persistInquiry(ROW.product + item.id, catalogRecord('product', item));
    await forgetDeleted('product', item.id);
    const next = read(KEYS.products);
    const index = next.findIndex((p) => p.id === item.id);
    if (index >= 0) next[index] = item;
    else next.push(item);
    write(KEYS.products, next);
    fresh = true;
    if (item.categoryId) recalcCategoryPriceFrom(item.categoryId);
    return item;
  }

  async function deleteCatalogRows(rowId) {
    for (let i = 0; i < 5; i++) {
      const data = await sheetsPost({ action: 'delete', type: 'inquiries', id: rowId });
      if (data && data.deleted === false) return;
    }
  }

  async function deleteProduct(id) {
    bump();
    const key = String(id || '');
    if (!key) throw new Error('削除する商品が指定されていません。');
    const list = read(KEYS.products).slice();
    const target = list.find((p) => String(p.id) === key);
    write(
      KEYS.products,
      list.filter((p) => String(p.id) !== key)
    );
    fresh = true;
    try {
      await deleteCatalogRows(ROW.product + key);
      await rememberDeleted('product', key);
    } catch (err) {
      write(KEYS.products, list);
      fresh = true;
      throw err;
    }
    if (target && target.categoryId) recalcCategoryPriceFrom(target.categoryId);
  }

  function getSuppliers() {
    return read(KEYS.suppliers)
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
  }

  function normalizeRateMap(rates) {
    const next = {};
    Object.keys(rates || {}).forEach((pref) => {
      const raw = rates[pref];
      if (raw === '' || raw == null) {
        next[pref] = null;
        return;
      }
      const n = Number(raw);
      next[pref] = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    });
    return next;
  }

  async function saveSupplier(data) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('仕入れ先名を入力してください。');
    bump();
    const list = read(KEYS.suppliers);
    const existing = data.id && list.some((row) => row.id === data.id);
    const prev = existing ? list.find((row) => row.id === data.id) : null;
    const now = nowISO();
    const item = {
      id: existing ? data.id : uid('s'),
      name,
      leadTime: String(data.leadTime || '').trim(),
      note: String(data.note || '').trim(),
      rates: normalizeRateMap(data.rates),
      undeliverable: Array.isArray(data.undeliverable)
        ? data.undeliverable.map((value) => String(value).trim()).filter(Boolean)
        : [],
      createdAt: (prev && prev.createdAt) || now,
      updatedAt: now,
    };
    await persistInquiry(ROW.supplier + item.id, catalogRecord('supplier', item));
    await forgetDeleted('supplier', item.id);
    const next = read(KEYS.suppliers);
    const index = next.findIndex((row) => row.id === item.id);
    if (index >= 0) next[index] = item;
    else next.push(item);
    write(KEYS.suppliers, next);
    fresh = true;
    return item;
  }

  async function deleteSupplier(id) {
    bump();
    const key = String(id || '');
    if (!key) throw new Error('削除する仕入れ先が指定されていません。');
    const used = getProducts(true).some((product) => String(product.supplierId || '') === key);
    if (used) throw new Error('この仕入れ先を発送元にしている商品があるため削除できません。');
    const list = read(KEYS.suppliers).slice();
    write(
      KEYS.suppliers,
      list.filter((row) => String(row.id) !== key)
    );
    fresh = true;
    try {
      await deleteCatalogRows(ROW.supplier + key);
      await rememberDeleted('supplier', key);
    } catch (err) {
      write(KEYS.suppliers, list);
      fresh = true;
      throw err;
    }
  }

  /** 公開ショップへ反映用スナップショット。取得成功後のスプレッドシート内容だけを返す。 */
  function snapshot() {
    if (!fresh) return { categories: [], products: [] };
    const products = getProducts(false);
    const categories = getCategories(true)
      .map((c) => {
        const prods = products.filter((p) => p.categoryId === c.id);
        const priceFrom = prods.length
          ? Math.min(...prods.map((p) => Number(p.price) || 0))
          : Number(c.priceFrom) || 0;
        return { ...c, priceFrom };
      })
      .filter((c) => products.some((p) => p.categoryId === c.id));
    return { categories, products };
  }

  function getRanking(categoryId, limit) {
    const n = limit || 5;
    let list = getProducts(false);
    if (categoryId && categoryId !== 'all') {
      list = list.filter((p) => p.categoryId === categoryId);
    }
    const featured = list.filter((p) => p.featured);
    const base = (featured.length ? featured : list).slice(0, n);
    return base;
  }

  const IMAGE_PRESETS = [
    'images/cat-western.jpg',
    'images/cat-soup.jpg',
    'images/cat-coffee.jpg',
    'images/cat-wagashi.jpg',
    'images/cat-bath.jpg',
    'images/product-sweets.jpg',
    'images/product-seaweed.jpg',
    'images/product-tea.jpg',
    'images/product-towel.jpg',
    'images/product-catalog.jpg',
    'images/product-seasoning.jpg',
    'images/product-baum.jpg',
  ];

  return {
    refresh,
    ensureSeed,
    getCategories,
    getProducts,
    getCategory,
    getProduct,
    saveCategory,
    deleteCategory,
    saveProduct,
    deleteProduct,
    getSuppliers,
    saveSupplier,
    deleteSupplier,
    snapshot,
    isFresh() {
      return fresh;
    },
    getRanking,
    IMAGE_PRESETS,
    isSheetsEnabled: sheetsEnabled,
    pushAllToSheets,
  };
})();
