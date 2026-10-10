/* 返礼品商品データ & カート */
window.HenreiyaShop = (function () {
  'use strict';

  let CATEGORIES = [];
  let PRODUCTS = [];
  let RANKINGS = {};

  function syncFromCatalog() {
    if (window.HenreiyaCatalog) {
      const snap = HenreiyaCatalog.snapshot();
      CATEGORIES = snap.categories.slice();
      PRODUCTS = snap.products.slice();
      RANKINGS = {};
      return;
    }
    const seed = window.HenreiyaCatalogSeed || {};
    CATEGORIES = (seed.categories || []).slice();
    PRODUCTS = (seed.products || []).slice();
    RANKINGS = seed.rankings || {};
  }

  syncFromCatalog();

  const CART_KEY = 'henreiya_cart';

  function getRanking(categoryId, limit) {
    if (window.HenreiyaCatalog) {
      return HenreiyaCatalog.getRanking(categoryId, limit || 5);
    }
    const key = categoryId && RANKINGS[categoryId] ? categoryId : 'all';
    const ids = RANKINGS[key] || RANKINGS.all || [];
    const n = limit || 5;
    return ids
      .map((id) => getProduct(id))
      .filter(Boolean)
      .slice(0, n);
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateBadges();
  }

  function getProduct(id) {
    return PRODUCTS.find((p) => p.id === id);
  }

  function getCategory(id) {
    return CATEGORIES.find((c) => c.id === id);
  }

  function productsByCategory(categoryId) {
    if (!categoryId || categoryId === 'all') return PRODUCTS.slice();
    return PRODUCTS.filter((p) => p.categoryId === categoryId);
  }

  function addToCart(id, qty) {
    const q = Math.max(1, Number(qty) || 1);
    const cart = getCart();
    const existing = cart.find((i) => i.id === id);
    if (existing) existing.qty += q;
    else cart.push({ id, qty: q });
    saveCart(cart);
    showToast('カートに追加しました');
  }

  function setQty(id, qty) {
    const q = Math.max(0, Number(qty) || 0);
    let cart = getCart();
    if (q === 0) cart = cart.filter((i) => i.id !== id);
    else {
      const item = cart.find((i) => i.id === id);
      if (item) item.qty = q;
    }
    saveCart(cart);
  }

  function removeItem(id) {
    saveCart(getCart().filter((i) => i.id !== id));
  }

  function clearCart() {
    saveCart([]);
  }

  function cartCount() {
    return getCart().reduce((sum, i) => sum + i.qty, 0);
  }

  function cartLines() {
    return getCart()
      .map((i) => {
        const p = getProduct(i.id);
        if (!p) return null;
        return { ...p, qty: i.qty, subtotal: p.price * i.qty };
      })
      .filter(Boolean);
  }

  function cartTotal() {
    return cartLines().reduce((s, l) => s + l.subtotal, 0);
  }

  function formatPrice(n) {
    return n.toLocaleString('ja-JP') + '円';
  }

  function updateBadges() {
    const count = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = String(count);
      el.hidden = count === 0;
    });
  }

  function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  function renderRanking(container, categoryId) {
    if (!container) return;
    const list = getRanking(categoryId, 5);
    const cat = getCategory(categoryId);
    const moreHref =
      categoryId && categoryId !== 'all'
        ? `shop.html?cat=${categoryId}#products`
        : 'shop.html#products';

    container.innerHTML = `
      <div class="rank-head">
        <h2 class="rank-head__title">カテゴリランキング</h2>
        ${
          cat
            ? `<p class="rank-head__sub">${cat.name}</p>`
            : `<p class="rank-head__sub">人気の返礼品</p>`
        }
      </div>
      <div class="rank-row">
        ${list
          .map(
            (p, i) => `
          <a href="product.html?id=${p.id}" class="rank-card">
            <div class="rank-card__img">
              <img src="${p.image}" alt="${p.name}" loading="lazy" width="280" height="280" />
              <span class="rank-badge rank-badge--${i + 1}">${i + 1}</span>
            </div>
            <span class="rank-card__brand">${p.category}</span>
            <span class="rank-card__name">${p.name}</span>
            <span class="rank-card__price">税込 ${p.price.toLocaleString('ja-JP')} 円</span>
          </a>`
          )
          .join('')}
      </div>
      <div class="rank-more">
        <a href="${moreHref}">もっと見る &gt;</a>
      </div>
    `;
  }

  function renderCategoryGrid(container) {
    if (!container) return;
    container.innerHTML = CATEGORIES.map(
      (c) => `
      <a href="shop.html?cat=${c.id}#products" class="cat-tile" style="background-image:url('${c.image}')">
        <span class="cat-tile__name">${c.name}</span>
        <span class="cat-tile__price">${formatPrice(c.priceFrom)}〜</span>
      </a>`
    ).join('');
  }

  function renderProductGrid(container, categoryId, sort) {
    if (!container) return;
    let list = productsByCategory(categoryId);
    if (sort === 'asc' || sort === 'desc') {
      list = list.slice().sort((a, b) => {
        const diff = (Number(a.price) || 0) - (Number(b.price) || 0);
        if (diff !== 0) return sort === 'asc' ? diff : -diff;
        return (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
      });
    }
    if (!list.length) {
      container.innerHTML =
        '<p class="cart-empty">このカテゴリの商品はまだありません。</p>';
      return;
    }
    container.innerHTML = list
      .map(
        (p) => `
      <article class="product-card reveal is-visible">
        <a href="product.html?id=${p.id}" class="product-card__img">
          <img src="${p.image}" alt="${p.name}" loading="lazy" width="400" height="400" />
        </a>
        <div class="product-card__body">
          <span class="product-card__cat">${p.category}</span>
          <h3 class="product-card__name"><a href="product.html?id=${p.id}">${p.name}</a></h3>
          <p class="product-card__price">${formatPrice(p.price)}<small>（税込）</small></p>
          <div class="product-card__actions">
            <a href="product.html?id=${p.id}" class="btn btn-secondary">詳細</a>
            <button type="button" class="btn btn-primary" data-add="${p.id}">カートへ</button>
          </div>
        </div>
      </article>`
      )
      .join('');

    container.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => addToCart(btn.dataset.add, 1));
    });
  }

  document.addEventListener('DOMContentLoaded', updateBadges);

  return {
    get CATEGORIES() { return CATEGORIES; },
    get PRODUCTS() { return PRODUCTS; },
    get RANKINGS() { return RANKINGS; },
    syncFromCatalog,
    getProduct,
    getCategory,
    getRanking,
    productsByCategory,
    getCart,
    addToCart,
    setQty,
    removeItem,
    clearCart,
    cartCount,
    cartLines,
    cartTotal,
    formatPrice,
    updateBadges,
    renderCategoryGrid,
    renderProductGrid,
    renderRanking,
    showToast,
  };
})();
