/* 商品詳細の見出し・説明・価格表示・構造化データ。
   ブラウザの商品ページと、開発サーバの初期HTMLで同じ関数を使う。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HenreiyaProductSeo = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function plain(value) {
    return String(value == null ? '' : value).trim();
  }

  function esc(value) {
    return plain(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return '';
    return number.toLocaleString('ja-JP') + '円';
  }

  function isConfiguredOrigin(value) {
    var origin = String(value || '').trim().replace(/\/+$/, '');
    if (!origin) return '';
    try {
      var url = new URL(origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      if (url.username || url.password) return '';
      var host = url.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return '';
      if (host === 'example.com' || host === 'example.org' || host === 'example.net') return '';
      return origin;
    } catch (err) {
      return '';
    }
  }

  function splitContents(value) {
    var source = plain(value);
    if (!source) return { items: [], note: '' };
    var body = source;
    var note = '';
    var marked = source.match(/^(.*?)(\s*【[^】]*】)\s*$/);
    if (marked && plain(marked[1])) {
      body = plain(marked[1]);
      note = plain(marked[2]);
    }
    var items = [];
    var buf = '';
    var round = 0;
    var square = 0;
    var i;
    for (i = 0; i < body.length; i += 1) {
      var ch = body.charAt(i);
      if (ch === '（' || ch === '(') round += 1;
      else if ((ch === '）' || ch === ')') && round) round -= 1;
      else if (ch === '【') square += 1;
      else if (ch === '】' && square) square -= 1;
      if (!round && !square && (ch === '・' || ch === '\n')) {
        if (plain(buf)) items.push(plain(buf));
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (plain(buf)) items.push(plain(buf));
    return { items: items.length ? items : [body], note: note };
  }

  function specList(pairs) {
    var rows = pairs.filter(function (row) {
      return plain(row[1]);
    });
    if (!rows.length) return '';
    return (
      '<dl class="product-specs">' +
      rows
        .map(function (row) {
          return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd></div>';
        })
        .join('') +
      '</dl>'
    );
  }

  var INITIAL_IMAGES = {
    'images/cat-western.jpg': 1,
    'images/cat-soup.jpg': 1,
    'images/cat-coffee.jpg': 1,
    'images/cat-wagashi.jpg': 1,
    'images/product-sweets.jpg': 1,
    'images/product-seaweed.jpg': 1,
    'images/product-tea.jpg': 1,
    'images/product-towel.jpg': 1,
    'images/product-catalog.jpg': 1,
    'images/product-seasoning.jpg': 1,
    'images/product-baum.jpg': 1,
  };

  function isInitialImage(src) {
    var value = plain(src).replace(/^\.\//, '').replace(/^(\.\.\/)+/, '').replace(/^\//, '');
    if (!value || /^data:/i.test(value) || /^https?:\/\//i.test(value)) return false;
    return !!INITIAL_IMAGES[value];
  }

  function galleryOf(item) {
    var list = [];
    function push(src) {
      var value = plain(src);
      if (!value || list.indexOf(value) !== -1 || list.length >= 10) return;
      list.push(value);
    }
    push(item && item.image);
    if (item && Array.isArray(item.images)) item.images.forEach(push);
    return list;
  }

  function sharePath(origin, src) {
    if (!src) return '';
    if (/^(https?:|data:)/i.test(src)) return src;
    if (origin) return origin + '/' + String(src).replace(/^\/+/, '');
    return src;
  }

  function clip(text, max) {
    var value = plain(text).replace(/\s+/g, ' ');
    if (value.length <= max) return value;
    return value.slice(0, max - 1) + '…';
  }

  function render(product, options) {
    var item = product || {};
    var origin = isConfiguredOrigin(options && options.siteOrigin);
    var intro = plain(item.desc)
      .split(/\n+/)
      .map(plain)
      .filter(Boolean);
    var introHtml =
      intro.length
        ? '<section class="product-block product-intro"><h2>商品紹介</h2>' +
          intro
            .map(function (line) {
              return '<p>' + esc(line) + '</p>';
            })
            .join('') +
          '</section>'
        : '';
    var set = splitContents(item.contents);
    var setItemsHtml = set.items.length
      ? '<ul class="product-set__items">' +
        set.items
          .map(function (entry) {
            return '<li>' + esc(entry) + '</li>';
          })
          .join('') +
        '</ul>' +
        (set.note ? '<p class="product-note">' + esc(set.note) + '</p>' : '')
      : '';
    var setHtml =
      setItemsHtml
        ? '<section class="product-block"><h2>内容</h2>' + setItemsHtml + '</section>'
        : '';
    var specHtml = specList([
      ['ブランド', item.brand],
      ['色柄', item.color],
      ['賞味期間（製造日から）', item.shelfLife],
      ['商品サイズ', item.productSize],
      ['箱サイズ', item.boxSize],
      ['商品重量', item.quantityText],
      ['材質', item.material],
    ]);
    var specSection = specHtml ? '<section class="product-block"><h2>商品仕様</h2>' + specHtml + '</section>' : '';
    var exTaxHtml = item.reducedTax
      ? '<p class="product-detail__ex-tax"><span>※軽減税率対象商品</span></p>'
      : '';
    var noteHtml = plain(item.note) ? '<p class="product-detail__note">' + esc(item.note) + '</p>' : '';
    var priceNote = '（税込）';
    var priceKicker = '';
    var priceLabel = formatPrice(item.price);
    var name = plain(item.name) || '商品';
    var category = plain(item.category);
    var title = name + '｜香典返し・返礼品｜株式会社返礼屋';
    var summary = intro[0] || plain(item.contents) || '';
    var description = name;
    if (category) description += '（' + category + '）';
    description += '。神奈川県綾瀬市の株式会社返礼屋が扱う香典返し・返礼品です。';
    if (summary) description += summary;
    if (priceLabel) description += '価格は' + priceLabel + priceNote + 'です。';
    description = clip(description, 140);
    var images = galleryOf(item);
    var image = images[0] || '';
    var pagePath = '/product.html?id=' + encodeURIComponent(plain(item.id));
    var shareImage = sharePath(origin, image);
    var thumbs =
      images.length > 1
        ? '<div class="product-gallery__thumbs">' +
          images
            .map(function (src, index) {
              return (
                '<button type="button" class="product-gallery__thumb' +
                (index === 0 ? ' is-on' : '') +
                '" data-gallery-src="' +
                esc(src) +
                '" aria-label="画像' +
                (index + 1) +
                'を表示" aria-pressed="' +
                (index === 0 ? 'true' : 'false') +
                '"><img src="' +
                esc(src) +
                '" alt="" /></button>'
              );
            })
            .join('') +
          '</div>'
        : '';
    var jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: name,
      description: summary || name,
      sku: plain(item.id),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'JPY',
        price: Number(item.price),
        description: '税込',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: Number(item.price),
          priceCurrency: 'JPY',
          valueAddedTaxIncluded: true,
        },
      },
    };
    if (image) jsonLd.image = shareImage;
    if (plain(item.brand)) jsonLd.brand = { '@type': 'Brand', name: plain(item.brand) };
    var jan = plain(item.jan);
    if (/^\d{13}$/.test(jan)) jsonLd.gtin13 = jan;
    jsonLd.offers.seller = { '@type': 'Organization', name: '株式会社返礼屋' };
    if (origin) jsonLd.offers.url = origin + pagePath;
    if (!Number.isFinite(jsonLd.offers.price)) {
      delete jsonLd.offers;
    }
    var imageHtml = image
      ? '<img id="product-gallery-main" src="' +
        esc(image) +
        '" alt="' +
        esc(name) +
        '" width="800" height="800" decoding="async" />'
      : '';
    var html =
      '<div class="product-detail__media">' +
      '<div class="product-detail__img">' +
      imageHtml +
      '</div>' +
      thumbs +
      introHtml +
      '</div>' +
      '<div class="product-detail__info">' +
      '<span class="product-card__cat">' +
      esc(category) +
      '</span>' +
      '<h1>' +
      esc(name) +
      '</h1>' +
      '<p class="product-detail__price">' +
      priceKicker +
      esc(priceLabel) +
      '<small>' +
      priceNote +
      '</small></p>' +
      exTaxHtml +
      noteHtml +
      setHtml +
      specSection +
      '<p class="product-detail__back">' +
      '<a href="shop.html?cat=' +
      esc(item.categoryId) +
      '#products">「' +
      esc(category) +
      '」の商品一覧へ</a>' +
      '</p>' +
      '<div class="qty-row">' +
      '<label for="qty">数量</label>' +
      '<input type="number" id="qty" min="1" max="99" value="1" />' +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-lg" id="btn-add">カートに入れる</button>' +
      '<p class="product-detail__note">※お支払いは銀行振込です。ご注文確定後に振込先をご案内します。</p>' +
      '</div>';
    return {
      id: plain(item.id),
      title: title,
      description: description,
      image: image,
      shareImage: shareImage,
      html: html,
      jsonLd: jsonLd,
      jsonLdText: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
    };
  }

  return { render: render, isConfiguredOrigin: isConfiguredOrigin };
});
