/* 公開サイトマップ。noindex のカートと注文手続きは入れない。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HenreiyaSitemap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATIC_PAGES = [
    '/index.html',
    '/shop.html',
    '/facility-home.html',
    '/reserve.html',
    '/staff.html',
    '/company.html',
    '/contact.html',
    '/terms.html',
    '/privacy.html',
    '/cookies.html',
  ];

  function originOf(value) {
    const origin = String(value || '').trim().replace(/\/+$/, '');
    if (!origin) throw new Error('siteOrigin が空です。');
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.hostname !== 'henreiya.vercel.app' || url.username || url.password) {
      throw new Error('公開サイトマップのドメインは https://henreiya.vercel.app だけです。');
    }
    return origin;
  }

  function xmlEscape(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function publishedProducts(products) {
    const ids = [];
    const seen = new Set();
    (products || []).forEach((product) => {
      if (!product || product.published === false) return;
      const id = String(product.id || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
    ids.sort();
    return ids;
  }

  function buildSitemap(input) {
    const origin = originOf(input && input.origin);
    const ids = publishedProducts(input && input.products);
    const locs = STATIC_PAGES.map((path) => origin + path).concat(
      ids.map((id) => origin + '/product.html?id=' + encodeURIComponent(id))
    );
    const body = locs
      .map((loc) => '  <url><loc>' + xmlEscape(loc) + '</loc></url>')
      .join('\n');
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      body +
      '\n</urlset>\n'
    );
  }

  return {
    STATIC_PAGES: STATIC_PAGES,
    publishedProducts: publishedProducts,
    buildSitemap: buildSitemap,
  };
});
