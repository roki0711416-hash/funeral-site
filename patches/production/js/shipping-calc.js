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
  const CATALOG_GIFT_FEE = 1210;
  const CHUGOKU_SHIKOKU = {
    鳥取県: true,
    島根県: true,
    岡山県: true,
    広島県: true,
    山口県: true,
    徳島県: true,
    香川県: true,
    愛媛県: true,
    高知県: true,
  };
  const KYUSHU = {
    福岡県: true,
    佐賀県: true,
    長崎県: true,
    熊本県: true,
    大分県: true,
    宮崎県: true,
    鹿児島県: true,
  };

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

  function regionalFee(prefecture) {
    if (prefecture === '北海道' || prefecture === '沖縄県') return 1760;
    if (CHUGOKU_SHIKOKU[prefecture] || KYUSHU[prefecture]) return 1100;
    if (PREFECTURES.indexOf(prefecture) >= 0) return 880;
    return null;
  }

  function defaultRates() {
    const rates = {};
    PREFECTURES.forEach((prefecture) => {
      rates[prefecture] = regionalFee(prefecture);
    });
    return rates;
  }

  function isCatalogGift(product) {
    return text(product && product.categoryId) === 'catalog' || text(product && product.category) === 'カタログギフト';
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

  function buildParcels(prefecture, rawItems, products, suppliers) {
    const errors = [];
    const lines = [];

    if (!PREFECTURES.includes(prefecture)) {
      errors.push({ code: 'prefecture', message: 'お届け先の都道府県を選択してください。' });
    }

    (rawItems || []).forEach((item) => {
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
        catalogGift: isCatalogGift(product),
      });
    });

    if (!lines.length) {
      errors.push({ code: 'empty', message: '注文する商品がありません。' });
    }

    const groups = new Map();
    lines.forEach((line) => {
      const key = line.catalogGift
        ? 'catalog-gift'
        : [line.supplierId, line.storage, line.bundleKey].join('\u0001');
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
        catalogGift: Boolean(first.catalogGift),
        fee: null,
        freeShipping: false,
        reason: '',
      };
      let block = '';

      if (first.catalogGift) {
        parcel.fee = CATALOG_GIFT_FEE;
        if (!parcel.supplierName) parcel.supplierName = 'カタログギフト';
      } else if (!PREFECTURES.includes(prefecture)) {
        block = 'prefecture';
        parcel.reason = '都道府県が未選択です。';
      } else if (supplier && (supplier.undeliverable || []).map(text).includes(prefecture)) {
        block = 'undeliverable';
        parcel.reason = supplier.name + 'は' + prefecture + 'へ配送できません。';
      } else if (allIncluded) {
        parcel.fee = 0;
      } else {
        const stored = supplier ? rateOf(supplier.rates && supplier.rates[prefecture]) : null;
        const rate = stored == null ? regionalFee(prefecture) : stored;
        if (rate == null) {
          block = 'unset';
          parcel.reason = (supplier ? supplier.name : '返礼屋') + 'の' + prefecture + '向け送料が未設定です。';
        } else {
          parcel.fee = rate;
        }
      }
      parcel.block = block;
      parcels.push(parcel);
    });

    return {
      errors,
      lines,
      parcels,
      goodsTotal: lines.reduce((sum, line) => sum + line.subtotal, 0),
    };
  }

  function generalGoodsTotal(lines) {
    return (lines || []).reduce((sum, line) => sum + (line.catalogGift ? 0 : line.subtotal), 0);
  }

  function applyFreeShipping(parcels, qualifies) {
    if (!qualifies) return;
    parcels.forEach((parcel) => {
      if (parcel.catalogGift) return;
      if (parcel.block === 'unset' || parcel.block === '') {
        parcel.fee = 0;
        parcel.freeShipping = true;
        parcel.block = '';
        parcel.reason = '';
      }
    });
  }

  function finishParcels(parcels, errors) {
    parcels.forEach((parcel) => {
      delete parcel.block;
      if (parcel.reason) errors.push({ code: 'shipping', message: parcel.reason, parcelId: parcel.id });
    });
  }

  function quote(input) {
    const prefecture = text(input && input.prefecture);
    const built = buildParcels(
      prefecture,
      input && input.items,
      indexById(input && input.products),
      indexById(input && input.suppliers)
    );
    const qualifiesFreeShipping = generalGoodsTotal(built.lines) >= FREE_SHIPPING_AT;
    applyFreeShipping(built.parcels, qualifiesFreeShipping);
    finishParcels(built.parcels, built.errors);
    const ok = built.errors.length === 0;
    const shippingTotal = ok ? built.parcels.reduce((sum, parcel) => sum + parcel.fee, 0) : null;
    return {
      ok,
      prefecture,
      lines: built.lines,
      parcels: built.parcels,
      goodsTotal: built.goodsTotal,
      shippingTotal,
      total: ok ? built.goodsTotal + shippingTotal : null,
      freeShipping: ok && shippingTotal === 0,
      freeShippingAt: FREE_SHIPPING_AT,
      errors: built.errors,
    };
  }

  function quoteShipments(input) {
    const products = indexById(input && input.products);
    const suppliers = indexById(input && input.suppliers);
    const rawDestinations = Array.isArray(input && input.destinations) ? input.destinations : [];
    if (!rawDestinations.length) {
      return {
        ok: false,
        destinations: [],
        lines: [],
        parcels: [],
        goodsTotal: 0,
        shippingTotal: null,
        total: null,
        freeShipping: false,
        freeShippingAt: FREE_SHIPPING_AT,
        errors: [{ code: 'empty', message: '配送先がありません。' }],
      };
    }

    const built = rawDestinations.map((dest, index) => {
      const id = text(dest && (dest.id || dest.destinationId)) || 'dest-' + (index + 1);
      const prefecture = text(dest && dest.prefecture);
      const result = buildParcels(prefecture, dest && dest.items, products, suppliers);
      result.parcels.forEach((parcel, parcelIndex) => {
        parcel.destinationId = id;
        parcel.destinationName = text(dest && (dest.shipName || dest.name));
        parcel.id = id + '-parcel-' + (parcelIndex + 1);
      });
      result.errors.forEach((error) => {
        error.destinationId = id;
      });
      return {
        id,
        prefecture,
        shipName: text(dest && (dest.shipName || dest.name)),
        shipTel: text(dest && (dest.shipTel || dest.tel)),
        shipZip: text(dest && (dest.shipZip || dest.zip)),
        shipCity: text(dest && (dest.shipCity || dest.city)),
        shipBuilding: text(dest && (dest.shipBuilding || dest.building)),
        lines: result.lines,
        parcels: result.parcels,
        goodsTotal: result.goodsTotal,
        errors: result.errors,
      };
    });

    const goodsTotal = built.reduce((sum, dest) => sum + dest.goodsTotal, 0);
    const qualifiesFreeShipping = built.reduce((sum, dest) => sum + generalGoodsTotal(dest.lines), 0) >= FREE_SHIPPING_AT;
    const errors = [];
    const parcels = [];
    const lines = [];
    built.forEach((dest) => {
      applyFreeShipping(dest.parcels, qualifiesFreeShipping);
      finishParcels(dest.parcels, dest.errors);
      errors.push.apply(errors, dest.errors);
      parcels.push.apply(parcels, dest.parcels);
      dest.lines.forEach((line) => {
        lines.push({
          id: line.id,
          name: line.name,
          price: line.price,
          qty: line.qty,
          subtotal: line.subtotal,
          supplierId: line.supplierId,
          storage: line.storage,
          bundleKey: line.bundleKey,
          shippingIncluded: line.shippingIncluded,
          destinationId: dest.id,
        });
      });
      const destOk = dest.errors.length === 0;
      dest.shippingTotal = destOk ? dest.parcels.reduce((sum, parcel) => sum + parcel.fee, 0) : null;
    });

    const ok = errors.length === 0;
    const shippingTotal = ok ? built.reduce((sum, dest) => sum + dest.shippingTotal, 0) : null;
    return {
      ok,
      destinations: built.map((dest) => ({
        id: dest.id,
        prefecture: dest.prefecture,
        shipName: dest.shipName,
        shipTel: dest.shipTel,
        shipZip: dest.shipZip,
        shipCity: dest.shipCity,
        shipBuilding: dest.shipBuilding,
        lines: dest.lines,
        parcels: dest.parcels,
        goodsTotal: dest.goodsTotal,
        shippingTotal: dest.shippingTotal,
      })),
      lines,
      parcels,
      goodsTotal,
      shippingTotal,
      total: ok ? goodsTotal + shippingTotal : null,
      freeShipping: ok && shippingTotal === 0,
      freeShippingAt: FREE_SHIPPING_AT,
      errors,
    };
  }

  function joinedAddress(parts) {
    return parts.map(text).filter(Boolean).join(' ');
  }

  function ordererFields(body) {
    const ordererPref = text(body.ordererPref);
    const ordererCity = text(body.ordererCity);
    const ordererBuilding = text(body.ordererBuilding);
    return {
      ordererZip: text(body.ordererZip),
      ordererPref,
      ordererCity,
      ordererBuilding,
      ordererAddr: text(body.ordererAddr) || joinedAddress([ordererCity, ordererBuilding]),
    };
  }

  function mournerFields(body) {
    const mournerCity = text(body.mournerCity);
    const mournerBuilding = text(body.mournerBuilding);
    return {
      mournerName: text(body.mournerName),
      mournerZip: text(body.mournerZip),
      mournerPref: text(body.mournerPref),
      mournerCity,
      mournerBuilding,
      mournerAddr: text(body.mournerAddr) || joinedAddress([mournerCity, mournerBuilding]),
    };
  }

  function buildOrder(body, quoteResult) {
    const orderer = ordererFields(body);
    const mourner = mournerFields(body);
    const multi = Array.isArray(quoteResult.destinations) && quoteResult.destinations.length;
    const shipments = multi
      ? quoteResult.destinations.map((dest) => ({
          id: dest.id,
          shipName: dest.shipName,
          shipTel: dest.shipTel,
          shipZip: dest.shipZip,
          prefecture: dest.prefecture,
          shipCity: dest.shipCity,
          shipBuilding: dest.shipBuilding,
          shipAddr: joinedAddress([dest.prefecture, dest.shipCity, dest.shipBuilding]),
          shippingTotal: dest.shippingTotal,
          items: dest.lines.map((line) => ({
            id: line.id,
            name: line.name,
            qty: line.qty,
            price: line.price,
          })),
        }))
      : [
          {
            shipName: text(body.shipName),
            shipTel: text(body.shipTel),
            shipZip: text(body.shipZip),
            shipAddr: text(body.shipAddr),
            prefecture: quoteResult.prefecture,
            items: quoteResult.lines.map((line) => ({ id: line.id, name: line.name, qty: line.qty })),
          },
        ];
    const first = shipments[0] || {};
    const merged = new Map();
    (quoteResult.lines || []).forEach((line) => {
      const current = merged.get(line.id);
      if (!current) {
        merged.set(line.id, {
          id: line.id,
          name: line.name,
          price: line.price,
          qty: line.qty,
          supplierId: line.supplierId,
          storage: line.storage,
          bundleKey: line.bundleKey,
          shippingIncluded: line.shippingIncluded,
        });
        return;
      }
      current.qty += line.qty;
    });
    const ship = {
      shipName: first.shipName || '',
      shipTel: first.shipTel || '',
      shipZip: first.shipZip || '',
      shipAddr: first.shipAddr || '',
      prefecture: first.prefecture || quoteResult.prefecture || '',
    };
    return {
      name: text(body.name),
      nameKana: text(body.nameKana),
      tel: text(body.tel),
      email: text(body.email),
      ...orderer,
      purpose: text(body.purpose),
      noshi: text(body.noshi),
      relation: text(body.relation),
      deceasedName: text(body.deceasedName),
      kaimyo: text(body.kaimyo),
      shipMonth: text(body.shipMonth),
      ...mourner,
      note: text(body.note),
      noshiType: text(body.noshiType || body.noshi),
      purposes: Array.isArray(body.purposes) ? body.purposes.map(text).filter(Boolean) : [],
      paymentMethod: 'bank_transfer',
      paymentStatus: 'unpaid',
      receiptRequested: body.receiptRequested === true,
      receiptStatus: 'none',
      receiptNumber: '',
      receiptIssuedAt: '',
      receiptSentAt: '',
      status: 'awaiting_payment',
      shipCount: shipments.length,
      ...ship,
      shipments,
      items: Array.from(merged.values()).map((line) => ({
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
        catalogGift: Boolean(parcel.catalogGift),
        freeShipping: Boolean(parcel.freeShipping),
        fee: parcel.fee,
        destinationId: parcel.destinationId || '',
        destinationName: parcel.destinationName || '',
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
    CATALOG_GIFT_FEE,
    regionalFee,
    defaultRates,
    STORAGE_LABEL,
    storageOf,
    rateOf,
    money,
    quote,
    quoteShipments,
    buildOrder,
  };
});
