/* 検証用の送料だけを使う。本番の仕入れ先や商品には書き込まない。 */
const calc = require('../js/shipping-calc');

const suppliers = [
  {
    id: 's-a',
    name: '検証仕入れ先A',
    leadTime: '3日',
    rates: { 東京都: 800, 大阪府: 900 },
    undeliverable: ['沖縄県'],
  },
  {
    id: 's-b',
    name: '検証仕入れ先B',
    leadTime: '5日',
    rates: { 東京都: 1200 },
    undeliverable: [],
  },
];

function product(id, extra) {
  return Object.assign(
    {
      id,
      name: id,
      price: 1000,
      published: true,
      supplierId: 's-a',
      storage: 'ambient',
      bundleKey: '',
      shippingIncluded: false,
    },
    extra
  );
}

function run(name, input, check) {
  const result = calc.quote(input);
  const problems = check(result);
  if (problems.length) {
    console.error('FAIL', name);
    problems.forEach((problem) => console.error(' -', problem));
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log('OK', name);
  }
}

const products = [
  product('room'),
  product('room2', { price: 1500 }),
  product('frozen', { storage: 'frozen', price: 2000 }),
  product('other', { supplierId: 's-b', price: 3000 }),
  product('included', { shippingIncluded: true, price: 500 }),
  product('plain', { price: 700 }),
  product('unset', { supplierId: 's-b' }),
];

run('同一発送元の同梱', {
  items: [
    { id: 'room', qty: 1 },
    { id: 'room2', qty: 2 },
  ],
  products,
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (!result.ok) problems.push('注文できるはず');
  if (result.parcels.length !== 1) problems.push('便は1つ');
  if (result.shippingTotal !== 800) problems.push('送料は1便分の800円');
  if (result.goodsTotal !== 4000) problems.push('商品代は4000円');
  if (result.total !== 4800) problems.push('合計は4800円');
  return problems;
});

run('異なる発送元', {
  items: [
    { id: 'room', qty: 1 },
    { id: 'other', qty: 1 },
  ],
  products,
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (!result.ok) problems.push('注文できるはず');
  if (result.parcels.length !== 2) problems.push('便は2つ');
  if (result.shippingTotal !== 2000) problems.push('800+1200');
  return problems;
});

run('常温と冷凍', {
  items: [
    { id: 'room', qty: 1 },
    { id: 'frozen', qty: 1 },
  ],
  products,
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (!result.ok) problems.push('注文できるはず');
  if (result.parcels.length !== 2) problems.push('温度帯で分ける');
  if (result.shippingTotal !== 1600) problems.push('同じ発送元でも2便分');
  return problems;
});

run('送料込みと通常の混在', {
  items: [
    { id: 'included', qty: 1 },
    { id: 'plain', qty: 1 },
  ],
  products,
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (!result.ok) problems.push('注文できるはず');
  if (result.parcels.length !== 1) problems.push('同じ便');
  if (result.shippingTotal !== 800) problems.push('通常商品があるので送料は無料にしない');
  if (result.goodsTotal !== 1200) problems.push('商品代は500+700');
  return problems;
});

run('同梱条件が違う', {
  items: [
    { id: 'room', qty: 1 },
    { id: 'separate', qty: 1 },
  ],
  products: products.concat([product('separate', { bundleKey: '別便', price: 400 })]),
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (!result.ok) problems.push('注文できるはず');
  if (result.parcels.length !== 2) problems.push('同梱条件が違うので2便');
  if (result.shippingTotal !== 1600) problems.push('条件ごとに送料がかかる');
  return problems;
});

run('送料未設定', {
  items: [{ id: 'unset', qty: 1 }],
  products,
  suppliers,
  prefecture: '大阪府',
}, (result) => {
  const problems = [];
  if (result.ok) problems.push('通してはいけない');
  if (result.shippingTotal !== null) problems.push('0円にしてはいけない');
  if (result.total !== null) problems.push('合計も確定しない');
  if (!result.errors.some((error) => error.message.indexOf('未設定') >= 0)) {
    problems.push('未設定の理由を出す');
  }
  return problems;
});

run('配送不可', {
  items: [{ id: 'room', qty: 1 }],
  products,
  suppliers,
  prefecture: '沖縄県',
}, (result) => {
  const problems = [];
  if (result.ok) problems.push('通してはいけない');
  if (result.shippingTotal !== null) problems.push('0円にしてはいけない');
  if (!result.errors.some((error) => error.message.indexOf('配送できません') >= 0)) {
    problems.push('配送不可の理由を出す');
  }
  return problems;
});

const order = calc.buildOrder(
  { name: '確認', goodsTotal: 1, shippingTotal: 1, total: 2 },
  calc.quote({
    items: [{ id: 'room', qty: 1 }],
    products,
    suppliers,
    prefecture: '東京都',
  })
);
if (order.total !== 1800 || order.goodsTotal !== 1000 || order.shippingTotal !== 800) {
  console.error('FAIL 画面の金額を使わない');
  process.exitCode = 1;
} else {
  console.log('OK 画面の金額を使わない');
}

run('商品代10000円で送料無料', {
  items: [{ id: 'high', qty: 1 }],
  products: products.concat([product('high', { price: 10000 })]),
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (!result.ok) problems.push('注文できるはず');
  if (!result.freeShipping) problems.push('送料無料になる');
  if (result.shippingTotal !== 0) problems.push('送料は0円');
  if (result.total !== 10000) problems.push('合計は商品代と同じ');
  return problems;
});

run('商品代9999円は通常送料', {
  items: [{ id: 'almost', qty: 1 }],
  products: products.concat([product('almost', { price: 9999 })]),
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (!result.ok) problems.push('注文できるはず');
  if (result.freeShipping) problems.push('10,000円未満は送料無料にしない');
  if (result.shippingTotal !== 800) problems.push('通常の送料がかかる');
  return problems;
});

run('複数便でも合計10000円以上で送料無料', {
  items: [
    { id: 'room', qty: 8 },
    { id: 'other', qty: 1 },
  ],
  products,
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (!result.ok) problems.push('注文できるはず');
  if (result.goodsTotal !== 11000) problems.push('商品代は11000円');
  if (result.parcels.length !== 2) problems.push('便は2つのまま');
  if (result.shippingTotal !== 0) problems.push('すべての便が送料無料');
  if (!result.parcels.every((parcel) => parcel.freeShipping && parcel.fee === 0)) {
    problems.push('便ごとに送料無料を記録する');
  }
  return problems;
});

run('10000円未満の送料込み混在は通常送料', {
  items: [
    { id: 'included', qty: 1 },
    { id: 'plain', qty: 1 },
  ],
  products,
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (result.shippingTotal !== 800) problems.push('10,000円未満なので通常送料');
  return problems;
});

run('10000円以上でも配送不可', {
  items: [{ id: 'high', qty: 1 }],
  products: products.concat([product('high', { price: 12000 })]),
  suppliers,
  prefecture: '沖縄県',
}, (result) => {
  const problems = [];
  if (result.ok) problems.push('通してはいけない');
  if (result.freeShipping) problems.push('配送不可を送料無料にしない');
  if (result.shippingTotal !== null) problems.push('送料は確定しない');
  return problems;
});

run('10000円以上でも発送元未設定', {
  items: [{ id: 'nosup', qty: 1 }],
  products: products.concat([product('nosup', { price: 12000, supplierId: '' })]),
  suppliers,
  prefecture: '東京都',
}, (result) => {
  const problems = [];
  if (result.ok) problems.push('通してはいけない');
  if (result.shippingTotal !== null) problems.push('0円にしてはいけない');
  if (!result.errors.some((error) => error.message.indexOf('発送元が未設定') >= 0)) {
    problems.push('発送元未設定の理由を出す');
  }
  return problems;
});

run('10000円以上で送料未設定でも無料', {
  items: [{ id: 'unset', qty: 10 }],
  products,
  suppliers,
  prefecture: '大阪府',
}, (result) => {
  const problems = [];
  if (result.goodsTotal !== 10000) problems.push('商品代は10000円');
  if (!result.ok) problems.push('送料未設定でも10,000円以上なら注文できる');
  if (result.shippingTotal !== 0) problems.push('送料は0円');
  return problems;
});

if (!process.exitCode) console.log('検証用データは本番に保存していません。');
