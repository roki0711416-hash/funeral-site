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
  let catalogInflight = null;
  let catalogInflightToken = 0;

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

  function isAdminPage() {
    return typeof location !== 'undefined' && /\/admin\//.test(location.pathname);
  }

  async function remote(method, url, body) {
    const res = await fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: body == null ? {} : { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
    });
    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      data = {};
    }
    if (!res.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || '通信に失敗しました。');
    }
    return data;
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

  const PUBLIC_CACHE_KEY = 'henreiya_catalog_list_v1';
  const ADMIN_CACHE_KEY = 'henreiya_admin_catalog_v1';

  function readPublicCache() {
    try {
      const raw = sessionStorage.getItem(PUBLIC_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.products) || !parsed.etag) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function writePublicCache(etag, loaded) {
    if (!etag) return;
    try {
      sessionStorage.setItem(
        PUBLIC_CACHE_KEY,
        JSON.stringify({
          etag: etag,
          products: loaded.products || [],
          categories: loaded.categories || [],
        })
      );
    } catch (err) {
      /* 容量不足のときは毎回取得する */
    }
  }

  function readAdminCache() {
    try {
      const raw = sessionStorage.getItem(ADMIN_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.categories)) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function writeAdminCache(etag, loaded) {
    try {
      sessionStorage.setItem(
        ADMIN_CACHE_KEY,
        JSON.stringify({
          etag: etag || '',
          products: loaded.products || [],
          categories: loaded.categories || [],
          suppliers: loaded.suppliers || [],
        })
      );
    } catch (err) {
      /* 容量不足のときは毎回取得する */
    }
  }

  function rememberAdminEdits() {
    if (!isAdminPage()) return;
    writeAdminCache('', {
      products: memory.products,
      categories: memory.categories,
      suppliers: memory.suppliers,
    });
  }

  function cacheHasRows(cached) {
    return Boolean(cached) && (cached.products.length > 0 || cached.categories.length > 0);
  }

  function primeAdminCache() {
    if (!isAdminPage()) return false;
    const cached = readAdminCache();
    if (!cacheHasRows(cached)) return false;
    applyCatalog(cached, false);
    return true;
  }

  function catalogResponseUsable(loaded) {
    return Boolean(loaded) && loaded.ok === true && Array.isArray(loaded.products) && Array.isArray(loaded.categories);
  }

  function applyCatalog(loaded, confirm) {
    if (!loaded || !Array.isArray(loaded.products) || !Array.isArray(loaded.categories)) {
      throw new Error('商品一覧の応答が不完全です。空の一覧では上書きしません。');
    }
    write(KEYS.products, loaded.products);
    write(KEYS.categories, loaded.categories);
    write(KEYS.suppliers, Array.isArray(loaded.suppliers) ? loaded.suppliers : []);
    writeDeleted({ products: [], categories: [], suppliers: [] });
    fresh = confirm !== false;
    clearLegacyCache();
  }

  async function refresh() {
    if (catalogInflight && catalogInflightToken === epoch) return catalogInflight;
    const token = ++epoch;
    fresh = false;
    const admin = isAdminPage();
    const url = admin ? '/api/admin/catalog' : '/api/catalog';
    const cached = admin ? readAdminCache() : readPublicCache();
    const job = (async () => {
      try {
        const headers = {};
        if (cacheHasRows(cached) && cached.etag) headers['If-None-Match'] = cached.etag;
        const res = await fetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: headers });
        if (token !== epoch) return { ok: true, source: 'database', unchanged: true, superseded: true };
        if (res.status === 304 && cacheHasRows(cached)) {
          applyCatalog(cached, true);
          return { ok: true, source: 'database', unchanged: true };
        }
        let loaded = null;
        try {
          loaded = await res.json();
        } catch (err) {
          loaded = null;
        }
        if (!res.ok || !catalogResponseUsable(loaded)) {
          throw new Error((loaded && loaded.error) || '商品一覧を読み込めませんでした。空の一覧では上書きしません。');
        }
        if (token !== epoch) return { ok: true, source: 'database', unchanged: true, superseded: true };
        applyCatalog(loaded, true);
        if (admin) writeAdminCache(res.headers.get('etag'), loaded);
        else writePublicCache(res.headers.get('etag'), loaded);
        return { ok: true, source: 'database', unchanged: false };
      } catch (err) {
        if (token !== epoch) return { ok: true, source: 'database', unchanged: true, superseded: true };
        fresh = false;
        if (!read(KEYS.products).length && !read(KEYS.categories).length) {
          write(KEYS.products, []);
          write(KEYS.categories, []);
          write(KEYS.suppliers, []);
          writeDeleted({ products: [], categories: [], suppliers: [] });
          clearLegacyCache();
        }
        console.warn('[HenreiyaCatalog] refresh failed', err);
        return { ok: false, source: 'none', error: err.message || '商品を読み込めませんでした。' };
      } finally {
        if (catalogInflight === job) catalogInflight = null;
      }
    })();
    catalogInflight = job;
    catalogInflightToken = token;
    return job;
  }

  function isShopVisible(product) {
    return Boolean(product) && product.published !== false && String(product.image || '').trim();
  }

  function findShopProduct(products, key) {
    const id = String(key || '').trim();
    if (!id) return null;
    const visible = (Array.isArray(products) ? products : []).filter(isShopVisible);
    return (
      visible.find((product) => String(product.id) === id) ||
      visible.find((product) => String(product.applicationNo || '').trim() === id) ||
      null
    );
  }

  async function loadProduct(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    try {
      const loaded = await remote('GET', '/api/catalog?id=' + encodeURIComponent(key));
      if (
        loaded &&
        isShopVisible(loaded.product) &&
        (String(loaded.product.id) === key || String(loaded.product.applicationNo || '').trim() === key)
      ) {
        return loaded.product;
      }
      const fromDetail = findShopProduct(loaded && loaded.products, key);
      if (fromDetail) return fromDetail;
    } catch (err) {
      /* 詳細用の id が無くても、ショップと同じ一覧から解決する */
    }
    try {
      const listed = await remote('GET', '/api/catalog');
      return findShopProduct(listed && listed.products, key);
    } catch (err) {
      return null;
    }
  }

  async function loadAdminProduct(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    const loaded = await remote('GET', '/api/admin/products?id=' + encodeURIComponent(key));
    const item = loaded.item || null;
    if (!item) return null;
    const list = read(KEYS.products);
    const index = list.findIndex((row) => row.id === item.id);
    if (index >= 0) list[index] = item;
    else list.push(item);
    write(KEYS.products, list);
    fresh = true;
    return item;
  }

  async function persistInquiry(rowId, record) {
    if (!record || record.catalogKind === 'deleted' || record.catalogKind === 'ready') {
      if (record && record.deleted) writeDeleted(record.deleted);
      return { ok: true };
    }
    const item = record.catalog;
    if (record.catalogKind === 'product') return remote('POST', '/api/admin/products', item);
    if (record.catalogKind === 'category') return remote('POST', '/api/admin/categories', item);
    if (record.catalogKind === 'supplier') return remote('POST', '/api/admin/suppliers', item);
    throw new Error('保存できないデータです。');
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

  async function recalcCategoryPriceFrom(categoryId) {
    const prods = getProducts(true).filter(
      (p) => p.categoryId === categoryId && p.published !== false
    );
    if (!prods.length) return;
    const min = Math.min(...prods.map((p) => Number(p.price) || 0));
    const cats = read(KEYS.categories);
    const i = cats.findIndex((c) => c.id === categoryId);
    if (i < 0 || Number(cats[i].priceFrom) === min) return;
    cats[i].priceFrom = min;
    write(KEYS.categories, cats);
    await persistInquiry(ROW.category + cats[i].id, catalogRecord('category', cats[i]));
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
    rememberAdminEdits();
    return item;
  }

  async function deleteCategory(id) {
    bump();
    const used = getProducts(true).some((p) => p.categoryId === id);
    if (used) throw new Error('このカテゴリを使う商品があるため削除できません');
    await deleteCatalogRows(ROW.category + id);
    await rememberDeleted('category', id);
    write(
      KEYS.categories,
      read(KEYS.categories).filter((c) => c.id !== id)
    );
    rememberAdminEdits();
  }

  function isPlaceholderImage(src) {
    const value = String(src || '').trim().replace(/^\.\//, '').replace(/^(\.\.\/)+/, '').replace(/^\//, '');
    if (!value || value.indexOf('data:') === 0 || /^https?:\/\//i.test(value)) return false;
    return IMAGE_PRESETS.indexOf(value) !== -1;
  }

  function dedupeImages(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((src) => {
      const value = String(src || '').trim();
      if (!value || out.indexOf(value) !== -1 || out.length >= 10) return;
      out.push(value);
    });
    return out;
  }

  function storedImages(product) {
    const list = [];
    if (product && product.image) list.push(product.image);
    if (product && Array.isArray(product.images)) product.images.forEach((src) => list.push(src));
    return dedupeImages(list);
  }

  /* 写真と初期画像が混在するときも、編集画面で決めた順を動かさない。
     初期画像だけの送信で、以前の実写真がある場合だけそれを前に戻す。 */
  function arrangeProductImages(prev, nextList) {
    const next = dedupeImages(nextList);
    const nextCustom = next.filter((src) => !isPlaceholderImage(src));
    if (nextCustom.length) return next;
    const prevCustom = storedImages(prev).filter((src) => !isPlaceholderImage(src));
    if (!prevCustom.length) return next;
    return dedupeImages(prevCustom.concat(next.filter(isPlaceholderImage)));
  }

  function sameGallery(sent, product) {
    const got = storedImages(product);
    if (got.length !== sent.length) return false;
    for (let i = 0; i < sent.length; i += 1) {
      if (got[i] !== sent[i]) return false;
    }
    return true;
  }

  function normalizeProductImages(data, prev, image) {
    const list = [];
    const push = (src) => {
      const value = String(src || '').trim();
      if (!value || list.indexOf(value) !== -1 || list.length >= 10) return;
      list.push(value);
    };
    if (Array.isArray(data.images)) {
      data.images.forEach(push);
      if (!list.length) push(image);
      return dedupeImages(list);
    } else {
      if (image) push(image);
      if (prev && Array.isArray(prev.images)) prev.images.forEach(push);
      if (!list.length && prev) push(prev.image);
    }
    return arrangeProductImages(prev, list);
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
    const images = normalizeProductImages(data, prev, image);
    const mainImage = images[0] || '';
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
      image: mainImage,
      images,
      desc: data.desc != null ? String(data.desc) : (prev && prev.desc) || '',
      sortOrder: Number(data.sortOrder) || (prev && prev.sortOrder) || list.length + 1,
      published: mainImage ? data.published !== false : false,
      featured: !!data.featured,
      createdAt: (prev && prev.createdAt) || now,
      updatedAt: now,
    };
    delete item.imageOriginal;
    const packed = catalogRecord('product', item);
    if (JSON.stringify(packed).length > 4500000) {
      throw new Error('画像が大きすぎて保存できません。別の写真を選んでください。');
    }
    const saved = await persistInquiry(ROW.product + item.id, packed);
    const galleryOnly = !!(saved && saved.galleryOnly);
    let confirmed = null;
    try {
      confirmed = await loadAdminProduct(item.id);
    } catch (err) {
      throw new Error('保存後の写真を読み戻せませんでした。並びが保存されたとは表示しません。');
    }
    if (!confirmed || !sameGallery(images, confirmed)) {
      throw new Error('写真の順番は保存されていません。再読み込みしても、選んだメイン画像のままではありません。');
    }
    const stored = { ...confirmed };
    delete stored.galleryOnly;
    await forgetDeleted('product', stored.id);
    const next = read(KEYS.products);
    const index = next.findIndex((p) => p.id === stored.id);
    if (index >= 0) next[index] = stored;
    else next.push(stored);
    write(KEYS.products, next);
    fresh = true;
    if (!galleryOnly && stored.categoryId) await recalcCategoryPriceFrom(stored.categoryId);
    rememberAdminEdits();
    if (galleryOnly) return Object.assign({}, stored, { galleryOnly: true });
    return stored;
  }

  async function deleteCatalogRows(rowId) {
    const id = String(rowId || '');
    if (id.indexOf(ROW.product) === 0) {
      await remote('DELETE', '/api/admin/products?id=' + encodeURIComponent(id.slice(ROW.product.length)));
      return;
    }
    if (id.indexOf(ROW.category) === 0) {
      await remote('DELETE', '/api/admin/categories?id=' + encodeURIComponent(id.slice(ROW.category.length)));
      return;
    }
    if (id.indexOf(ROW.supplier) === 0) {
      await remote('DELETE', '/api/admin/suppliers?id=' + encodeURIComponent(id.slice(ROW.supplier.length)));
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
    if (target && target.categoryId) await recalcCategoryPriceFrom(target.categoryId);
    rememberAdminEdits();
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
    rememberAdminEdits();
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
    rememberAdminEdits();
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
      .filter((c) => products.some((p) => p.categoryId === c.id) || c.name === 'カタログギフト');
    return { categories, products };
  }

  const RECENT_VIEWS_KEY = 'henreiya_recent_views';
  const CART_KEY = 'henreiya_cart';

  function readJsonList(storage, key) {
    try {
      const data = JSON.parse(storage.getItem(key) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (err) {
      return [];
    }
  }

  function rememberView(product) {
    if (!product || !product.id || product.published === false || !String(product.image || '').trim()) return;
    const id = String(product.id);
    const next = readJsonList(localStorage, RECENT_VIEWS_KEY).filter((item) => item && String(item.id) !== id);
    next.unshift({ id, categoryId: product.categoryId || '' });
    try {
      localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(next.slice(0, 12)));
    } catch (err) {
      /* 表示用の履歴だけなので、保存できない場合は選考に使わない */
    }
  }

  function interestSignals() {
    const ids = new Set();
    const categories = new Set();
    const catalog = getProducts(false);
    const byId = new Map(catalog.map((product) => [String(product.id), product]));
    readJsonList(localStorage, RECENT_VIEWS_KEY).forEach((item) => {
      if (!item || !item.id) return;
      const product = byId.get(String(item.id));
      if (!product) return;
      ids.add(String(product.id));
      if (product.categoryId) categories.add(product.categoryId);
    });
    readJsonList(localStorage, CART_KEY).forEach((item) => {
      if (!item || !item.id) return;
      const product = byId.get(String(item.id));
      if (!product) return;
      ids.add(String(product.id));
      if (product.categoryId) categories.add(product.categoryId);
    });
    return { ids, categories };
  }

  function weightedPick(entries, count) {
    const pool = entries.slice();
    const picked = [];
    while (picked.length < count && pool.length) {
      const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
      let cursor = Math.random() * total;
      let index = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        cursor -= pool[i].weight;
        if (cursor <= 0) {
          index = i;
          break;
        }
      }
      picked.push(pool.splice(index, 1)[0].product);
    }
    return picked;
  }

  function pickRanking(list, count, scope) {
    const sessionKey = 'henreiya_rank_session_' + scope;
    const previousKey = 'henreiya_rank_previous_' + scope;
    const byId = new Map(list.map((product) => [String(product.id), product]));
    try {
      const cached = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      if (Array.isArray(cached) && cached.length) {
        const current = cached.map((id) => byId.get(String(id))).filter(Boolean);
        if (current.length >= Math.min(count, list.length)) return current.slice(0, count);
      }
    } catch (err) {
      /* セッションを使えない場合は、その場で選び直す */
    }
    let previous = [];
    try {
      previous = JSON.parse(localStorage.getItem(previousKey) || '[]');
    } catch (err) {
      previous = [];
    }
    const seen = new Set(Array.isArray(previous) ? previous.map(String) : []);
    const interest = interestSignals();
    const weightOf = (product) => (seen.has(String(product.id)) ? 0.3 : 1);
    const preferred = list.filter(
      (product) => interest.categories.has(product.categoryId) || interest.ids.has(String(product.id))
    );
    const preferredCount = preferred.length
      ? Math.min(preferred.length, Math.max(1, Math.round(count * 0.6)))
      : 0;
    const picked = weightedPick(
      preferred.map((product) => ({ product, weight: weightOf(product) })),
      preferredCount
    );
    const used = new Set(picked.map((product) => product.id));
    const rest = list.filter((product) => !used.has(product.id));
    picked.push(
      ...weightedPick(
        rest.map((product) => ({ product, weight: weightOf(product) })),
        count - picked.length
      )
    );
    const ids = picked.map((product) => product.id);
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(ids));
      localStorage.setItem(previousKey, JSON.stringify(ids));
    } catch (err) {
      /* 次回の変化に使えないだけで、今回の表示は行う */
    }
    return picked;
  }

  function getRanking(categoryId, limit) {
    const n = limit || 5;
    let list = getProducts(false);
    if (categoryId && categoryId !== 'all') {
      list = list.filter((p) => p.categoryId === categoryId);
    }
    const featured = list.filter((p) => p.featured);
    if (featured.length) return featured.slice(0, n);
    return pickRanking(list, n, categoryId && categoryId !== 'all' ? categoryId : 'all');
  }

  const IMAGE_PRESETS = [
    'images/cat-western.jpg',
    'images/cat-soup.jpg',
    'images/cat-coffee.jpg',
    'images/cat-wagashi.jpg',
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
    primeAdminCache,
    loadProduct,
    loadAdminProduct,
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
    catalogResponseUsable,
    rememberView,
    IMAGE_PRESETS,
    isPlaceholderImage,
    displayImage(product) {
      const images = arrangeProductImages(null, storedImages(product));
      return images[0] || '';
    },
    isSheetsEnabled: sheetsEnabled,
    pushAllToSheets,
  };
})();
