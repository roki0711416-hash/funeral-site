/* 公開中フロントの写真順・一覧プレビュー・商品詳細解決。
   本番の admin/products.html と js/catalog-store.js に同じ判定を入れる。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HenreiyaPhotoOrder = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clean(src) {
    return String(src || '').trim();
  }

  function isShopVisible(product) {
    return Boolean(product) && product.published !== false && Boolean(clean(product.image));
  }

  /* ショップが一覧に出す id / 申込番号だけを詳細でも解決する。非公開や写真なしは返さない。 */
  function findShopProduct(products, key) {
    const id = clean(key);
    if (!id) return null;
    const visible = (Array.isArray(products) ? products : []).filter(isShopVisible);
    return (
      visible.find((product) => String(product.id) === id) ||
      visible.find((product) => clean(product.applicationNo) === id) ||
      null
    );
  }

  /* data URL も保存済み画像として一覧に出す。長さでは未設定にしない。 */
  function listPreviewSrc(src) {
    return clean(src);
  }

  function rowPreviewSource(product) {
    const main = clean(product && product.image);
    if (main) return main;
    const extra = product && Array.isArray(product.images) ? product.images : [];
    for (let i = 0; i < extra.length; i += 1) {
      const value = clean(extra[i]);
      if (value) return value;
    }
    return '';
  }

  /* 複数選択の並びは渡された順のまま。先頭へ足すときに1枚ずつ unshift して逆順にしない。 */
  function addPreparedImages(current, urls, isPlaceholder) {
    const gallery = (Array.isArray(current) ? current : []).map(clean).filter(Boolean);
    const incoming = [];
    (Array.isArray(urls) ? urls : []).forEach((src) => {
      const value = clean(src);
      if (!value || incoming.indexOf(value) !== -1 || gallery.indexOf(value) !== -1) return;
      incoming.push(value);
    });
    if (!incoming.length) return { images: gallery.slice(0, 10), skipped: 0 };
    const placeholder = typeof isPlaceholder === 'function' ? isPlaceholder : function () { return false; };
    const onlyInitial = !gallery.some((src) => !placeholder(src));
    const next = onlyInitial ? incoming.concat(gallery) : gallery.concat(incoming);
    const seen = [];
    next.forEach((src) => {
      if (seen.indexOf(src) === -1) seen.push(src);
    });
    return {
      images: seen.slice(0, 10),
      skipped: Math.max(0, seen.length - 10),
    };
  }

  return {
    isShopVisible: isShopVisible,
    findShopProduct: findShopProduct,
    listPreviewSrc: listPreviewSrc,
    rowPreviewSource: rowPreviewSource,
    addPreparedImages: addPreparedImages,
  };
});
