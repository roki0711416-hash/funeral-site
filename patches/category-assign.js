/* 商品のカテゴリだけを付け替える。写真の一括保存とは別で、成功は読み戻しで確認する。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HenreiyaCategoryAssign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function galleryList(product) {
    const list = [];
    const push = (src) => {
      const value = String(src || '').trim();
      if (!value || list.indexOf(value) !== -1) return;
      list.push(value);
    };
    if (product) push(product.image);
    if (product && Array.isArray(product.images)) product.images.forEach(push);
    return list;
  }

  function categoryOnlyPayload(product, category) {
    const next = Object.assign({}, product);
    delete next.galleryOnly;
    delete next.imageOriginal;
    next.categoryId = category.id;
    next.category = category.name;
    return next;
  }

  function assessCategorySave(before, after, categoryId) {
    if (!before || !after) {
      return { ok: false, retry: false, reason: '保存後の商品を読み戻せませんでした。自動では再送しません。' };
    }
    if (String(after.categoryId || '') !== String(categoryId || '')) {
      return { ok: false, retry: false, reason: 'カテゴリは保存されていません。写真はそのままです。自動では再送しません。' };
    }
    const previous = galleryList(before);
    const current = galleryList(after);
    if (previous.length !== current.length || previous.some((src, index) => src !== current[index])) {
      return { ok: false, retry: false, reason: '写真が変わったため、カテゴリ変更は成功にしません。自動では再送しません。' };
    }
    if (String(before.name || '') !== String(after.name || '') || Number(before.price) !== Number(after.price)) {
      return { ok: false, retry: false, reason: '商品名または価格が変わったため、ここで止めました。自動では再送しません。' };
    }
    if ((before.published !== false) !== (after.published !== false)) {
      return { ok: false, retry: false, reason: '公開状態が変わったため、ここで止めました。自動では再送しません。' };
    }
    if (String(before.applicationNo || '') !== String(after.applicationNo || '')) {
      return { ok: false, retry: false, reason: '申込番号が変わったため、ここで止めました。自動では再送しません。' };
    }
    return { ok: true, retry: false, reason: '' };
  }

  return {
    galleryList: galleryList,
    categoryOnlyPayload: categoryOnlyPayload,
    assessCategorySave: assessCategorySave,
  };
});
