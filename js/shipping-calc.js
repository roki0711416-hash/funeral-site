/* 仕入れ先直送の送料計算。画面とサーバーで同じ関数を使う。金額の初期値は持たない。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HenreiyaShipping = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PREFECTURES = [
    '北海道',
    '青森県',
    '岩手県',
    '宮城県',
    '秋田県',
    '山形県',
    '福島県',
    '茨城県',
    '栃木県',
    '群馬県',
    '埼玉県',
    '千葉県',
    '東京都',
    '神奈川県',
    '新潟県',
    '富山県',
    '石川県',
    '福井県',
    '山梨県',
    '長野県',
    '岐阜県',
    '静岡県',
    '愛知県',
    '三重県',
    '滋賀県',
    '京都府',
    '大阪府',
    '兵庫県',
    '奈良県',
    '和歌山県',
    '鳥取県',
    '島根県',
    '岡山県',
    '広島県',
    '山口県',
    '徳島県',
    '香川県',
    '愛媛県',
    '高知県',
    '福岡県',
    '佐賀県',
    '長崎県',
    '熊本県',
    '大分県',
    '宮崎県',
    '鹿児島県',
    '沖縄県',
  ];

  const STORAGE_LABEL = {
    ambient: '常温',
    chilled: '冷蔵',
    frozen: '冷凍',
  };
  const FREE_SHIPPING_AT = 10000;

  function storageOf(value) {
    return STORAGE_LABEL[value] ? value : 'ambient';
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function rateOf(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  }

  function money(n) {
    return Number(n).toLocaleString('ja-JP') + '円';
  }

  function indexById(list) {
    const map = new Map();
    (list || []).forEach((item) => {
      if (item && item.id) map.set(String(item.id), item);
    });
    return map;
  }

  function quote(input) {
    const prefecture = text(input && input.prefecture);
    const products = indexById(input && input.products);
    const suppliers = indexById(input && input.suppliers);
    const errors = [];
    const lines = [];

    if (!PREFECTURES.includes(prefecture)) {
      errors.push({ code: 'prefecture', message: 'お届け先の都道府県を選択してください。' });
    }

    (input && input.items ? input.items : []).forEach((item) => {
      const id = text(item && item.id);
      const qty = Math.floor(Number(item && item.qty) || 0);
      const product = products.get(id);
      if (!product || product.published === false) {
        errors.push({ code: 'product', message: '販売していない商品が含まれています。' });
        return;
      }
      if (qty < 1) return;
      const price = Math.round(Number(product.price) || 0);
      lines.push({
        id: product.id,
        name: text(product.name),
        price,
        qty,
        subtotal: price * qty,
        supplierId: text(product.supplierId),
        storage: storageOf(product.storage),
        bundleKey: text(product.bundleKey),
        shippingIncluded: Boolean(product.shippingIncluded),
      });
    });

    if (!lines.length) {
      errors.push({ code: 'empty', message: '注文する商品がありません。' });
    }

    const groups = new Map();
    lines.forEach((line) => {
      const key = [line.supplierId, line.storage, line.bundleKey].join('\u0001');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(line);
    });

    const parcels = [];
    groups.forEach((group) => {
      const first = group[0];
      const supplier = suppliers.get(first.supplierId);
      const allIncluded = group.every((line) => line.shippingIncluded);
      const parcel = {
        id: 'parcel-' + (parcels.length + 1),
        supplierId: first.supplierId,
        supplierName: supplier ? text(supplier.name) : '',
        storage: first.storage,
        storageLabel: STORAGE_LABEL[first.storage],
        bundleKey: first.bundleKey,
        leadTime: supplier ? text(supplier.leadTime) : '',
        items: group.map((line) => ({
          id: line.id,
          name: line.name,
          price: line.price,
          qty: line.qty,
          shippingIncluded: line.shippingIncluded,
        })),
        shippingIncluded: allIncluded,
        fee: null,
        freeShipping: false,
        reason: '',
      };
      let block = '';

      if (!first.supplierId || !supplier) {
        block = 'supplier';
        parcel.reason = '発送元が未設定です。';
      } else if (!PREFECTURES.includes(prefecture)) {
        block = 'prefecture';
        parcel.reason = '都道府県が未選択です。';
      } else if ((supplier.undeliverable || []).map(text).includes(prefecture)) {
        block = 'undeliverable';
        parcel.reason = supplier.name + 'は' + prefecture + 'へ配送できません。';
      } else if (allIncluded) {
        parcel.fee = 0;
      } else {
        const rate = rateOf(supplier.rates && supplier.rates[prefecture]);
        if (rate == null) {
          block = 'unset';
          parcel.reason = supplier.name + 'の' + prefecture + '向け送料が未設定です。';
        } else {
          parcel.fee = rate;
        }
      }
      parcel.block = block;
      parcels.push(parcel);
    });

    const goodsTotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
    const qualifiesFreeShipping = goodsTotal >= FREE_SHIPPING_AT;
    if (qualifiesFreeShipping) {
      parcels.forEach((parcel) => {
        if (parcel.block === 'unset' || parcel.block === '') {
          parcel.fee = 0;
          parcel.freeShipping = true;
          parcel.block = '';
          parcel.reason = '';
        }
      });
    }

    parcels.forEach((parcel) => {
      delete parcel.block;
      if (parcel.reason) errors.push({ code: 'shipping', message: parcel.reason, parcelId: parcel.id });
    });

    const ok = errors.length === 0;
    const freeShipping = ok && qualifiesFreeShipping;
    const shippingTotal = ok ? parcels.reduce((sum, parcel) => sum + parcel.fee, 0) : null;
    return {
      ok,
      prefecture,
      lines,
      parcels,
      goodsTotal,
      shippingTotal,
      total: ok ? goodsTotal + shippingTotal : null,
      freeShipping,
      freeShippingAt: FREE_SHIPPING_AT,
      errors,
    };
  }

  function buildOrder(body, quoteResult) {
    const ship = {
      shipName: text(body.shipName),
      shipTel: text(body.shipTel),
      shipZip: text(body.shipZip),
      shipAddr: text(body.shipAddr),
      prefecture: quoteResult.prefecture,
    };
    return {
      name: text(body.name),
      nameKana: text(body.nameKana),
      tel: text(body.tel),
      email: text(body.email),
      ordererAddr: text(body.ordererAddr),
      purpose: text(body.purpose),
      noshi: text(body.noshi),
      relation: text(body.relation),
      deceasedName: text(body.deceasedName),
      kaimyo: text(body.kaimyo),
      shipMonth: text(body.shipMonth),
      mournerName: text(body.mournerName),
      mournerZip: text(body.mournerZip),
      mournerPref: text(body.mournerPref),
      mournerAddr: text(body.mournerAddr),
      note: text(body.note),
      noshiType: text(body.noshiType || body.noshi),
      purposes: Array.isArray(body.purposes) ? body.purposes.map(text).filter(Boolean) : [],
      paymentMethod: 'bank_transfer',
      status: 'awaiting_payment',
      shipCount: 1,
      prefecture: quoteResult.prefecture,
      ...ship,
      shipments: [
        {
          ...ship,
          items: quoteResult.lines.map((line) => ({ id: line.id, qty: line.qty })),
        },
      ],
      items: quoteResult.lines.map((line) => ({
        id: line.id,
        name: line.name,
        price: line.price,
        qty: line.qty,
        supplierId: line.supplierId,
        supplierName: (quoteResult.parcels.find((parcel) =>
          parcel.items.some((item) => item.id === line.id)
        ) || {}).supplierName || '',
        storage: line.storage,
        storageLabel: STORAGE_LABEL[line.storage],
        bundleKey: line.bundleKey,
        shippingIncluded: line.shippingIncluded,
      })),
      parcels: quoteResult.parcels.map((parcel) => ({
        id: parcel.id,
        supplierId: parcel.supplierId,
        supplierName: parcel.supplierName,
        storage: parcel.storage,
        storageLabel: parcel.storageLabel,
        bundleKey: parcel.bundleKey,
        leadTime: parcel.leadTime,
        items: parcel.items,
        shippingIncluded: parcel.shippingIncluded,
        freeShipping: Boolean(parcel.freeShipping),
        fee: parcel.fee,
        status: 'unshipped',
        trackingNo: '',
      })),
      goodsTotal: quoteResult.goodsTotal,
      shippingTotal: quoteResult.shippingTotal,
      total: quoteResult.total,
      freeShipping: Boolean(quoteResult.freeShipping),
      freeShippingAt: quoteResult.freeShippingAt,
    };
  }

  return {
    PREFECTURES,
    FREE_SHIPPING_AT,
    STORAGE_LABEL,
    storageOf,
    rateOf,
    money,
    quote,
    buildOrder,
  };
});
