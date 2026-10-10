const calc = require('../js/shipping-calc');
const sheets = require('../lib/sheets-server');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' });
    return;
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const remote = await sheets.loadCatalog();
    const result = calc.quote({
      items: body.items,
      products: remote.products,
      suppliers: remote.suppliers,
      prefecture: body.prefecture,
    });
    res.status(200).json({ ok: true, quote: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: '送料を計算できませんでした。時間をおいて再度お試しください。' });
  }
};
