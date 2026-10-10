const calc = require('../js/shipping-calc');
const sheets = require('../lib/sheets-server');

function text(value) {
  return String(value == null ? '' : value).trim();
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (!text(body.name) || !text(body.tel) || !text(body.email)) {
      res.status(400).json({ ok: false, error: 'ご注文者の氏名・電話番号・メールアドレスを入力してください。' });
      return;
    }
    if (!text(body.shipName) || !text(body.shipTel) || !text(body.shipZip) || !text(body.shipAddr)) {
      res.status(400).json({ ok: false, error: 'お届け先を入力してください。' });
      return;
    }
    const remote = await sheets.loadCatalog();
    const result = calc.quote({
      items: body.items,
      products: remote.products,
      suppliers: remote.suppliers,
      prefecture: body.prefecture,
    });
    if (!result.ok) {
      res.status(400).json({
        ok: false,
        error: (result.errors[0] && result.errors[0].message) || 'この内容では注文できません。',
        quote: result,
      });
      return;
    }
    const order = calc.buildOrder(body, result);
    const saved = await sheets.createOrder(order);
    res.status(200).json({
      ok: true,
      order: {
        id: saved.id,
        goodsTotal: order.goodsTotal,
        shippingTotal: order.shippingTotal,
        total: order.total,
        parcels: order.parcels,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: '注文を確定できませんでした。時間をおいて再度お試しください。' });
  }
};
