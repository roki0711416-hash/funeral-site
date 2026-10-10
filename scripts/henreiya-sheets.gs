/**
 * 株式会社返礼屋 — Googleスプレッドシート連携スクリプト
 *
 * 【セットアップ手順】
 * 1. https://sheets.google.com で新しいスプレッドシートを作成
 * 2. 拡張機能 → Apps Script を開く
 * 3. このファイルの内容をすべて貼り付けて保存
 * 4. 左の「デプロイ」→「新しいデプロイ」
 *    - 種類: ウェブアプリ
 *    - 説明: henreiya-api
 *    - 実行ユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 5. デプロイ後に表示されるURLをコピー
 * 6. サイトの js/sheets-config.js の WEB_APP_URL に貼り付け
 * 7. サイトを再デプロイ（vercel --prod）
 *
 * 初回実行時、シート「予約」「注文」「お問い合わせ」「商品」「カテゴリ」が自動作成されます。
 */

var SHEET_NAMES = {
  reservations: '予約',
  orders: '注文',
  inquiries: 'お問い合わせ',
  products: '商品',
  categories: 'カテゴリ',
};

function doGet(e) {
  try {
    var action = (e.parameter && e.parameter.action) || 'list';
    var type = (e.parameter && e.parameter.type) || '';

    if (action === 'ping') {
      return json_({ ok: true, message: 'henreiya sheets api' });
    }

    if (action === 'list') {
      if (!SHEET_NAMES[type]) {
        return json_({ ok: false, error: 'invalid type' });
      }
      return json_({ ok: true, items: listItems_(type) });
    }

    if (action === 'listAll') {
      return json_({
        ok: true,
        reservations: listItems_('reservations'),
        orders: listItems_('orders'),
        inquiries: listItems_('inquiries'),
        products: listItems_('products'),
        categories: listItems_('categories'),
      });
    }

    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || '{}';
    var body = JSON.parse(raw);
    var action = body.action || 'create';
    var type = body.type || '';

    if (!SHEET_NAMES[type] && action !== 'ping') {
      return json_({ ok: false, error: 'invalid type' });
    }

    if (action === 'create') {
      var item = body.item || {};
      if (!item.id) {
        item.id = type.charAt(0).toUpperCase() + '-' + Date.now().toString(36);
      }
      if (!item.createdAt) item.createdAt = new Date().toISOString();
      if (!item.status && type !== 'products' && type !== 'categories') item.status = 'new';
      appendItem_(type, item);
      return json_({ ok: true, item: item });
    }

    if (action === 'update') {
      var updated = updateItem_(type, body.id, body.patch || {});
      if (!updated) return json_({ ok: false, error: 'not found' });
      return json_({ ok: true, item: updated });
    }

    if (action === 'delete') {
      var deleted = deleteItem_(type, body.id);
      return json_({ ok: deleted, deleted: deleted });
    }

    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSheet_(type) {
  var ss = getSpreadsheet_();
  var name = SHEET_NAMES[type];
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(['受付日時', 'ID', '状態', '要約', 'JSON']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 80);
    sheet.setColumnWidth(4, 280);
    sheet.setColumnWidth(5, 500);
  }
  return sheet;
}

function summarize_(type, item) {
  if (type === 'reservations') {
    return [item.facility, item.date, item.company, item.name, item.tel]
      .filter(Boolean)
      .join(' / ');
  }
  if (type === 'orders') {
    return [item.name, item.tel, (item.total != null ? item.total + '円' : ''), (item.paymentMethod === 'bank_transfer' || !item.paymentMethod ? '銀行振込' : item.paymentMethod), item.purpose]
      .filter(Boolean)
      .join(' / ');
  }
  if (type === 'products') {
    return [item.name, item.category, (item.price != null ? item.price + '円' : ''), item.published === false ? '非公開' : '公開']
      .filter(Boolean)
      .join(' / ');
  }
  if (type === 'categories') {
    return [item.name, item.id, (item.priceFrom != null ? item.priceFrom + '円〜' : '')]
      .filter(Boolean)
      .join(' / ');
  }
  return [item.name, item.tel, (item.message || '').slice(0, 40)].filter(Boolean).join(' / ');
}

function appendItem_(type, item) {
  var sheet = ensureSheet_(type);
  sheet.appendRow([
    item.createdAt || new Date().toISOString(),
    item.id,
    item.status || 'new',
    summarize_(type, item),
    JSON.stringify(item),
  ]);
}

function listItems_(type) {
  var sheet = ensureSheet_(type);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var items = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var json = row[4];
    var item = null;
    if (json) {
      try {
        item = JSON.parse(json);
      } catch (e) {
        item = null;
      }
    }
    if (!item) {
      item = {
        id: row[1],
        status: row[2] || 'new',
        createdAt: row[0] instanceof Date ? row[0].toISOString() : String(row[0] || ''),
        summary: row[3],
      };
    }
    items.push(item);
  }
  items.sort(function (a, b) {
    if (type === 'products' || type === 'categories') {
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  return items;
}

function findRow_(sheet, id) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][1]) === String(id)) return i + 1; // 1-based
  }
  return -1;
}

function updateItem_(type, id, patch) {
  var sheet = ensureSheet_(type);
  var row = findRow_(sheet, id);
  if (row < 0) return null;
  var json = sheet.getRange(row, 5).getValue();
  var item = {};
  try {
    item = JSON.parse(json || '{}');
  } catch (e) {
    item = { id: id };
  }
  for (var k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) item[k] = patch[k];
  }
  item.updatedAt = new Date().toISOString();
  sheet.getRange(row, 1).setValue(item.createdAt || '');
  sheet.getRange(row, 2).setValue(item.id);
  sheet.getRange(row, 3).setValue(item.status || 'new');
  sheet.getRange(row, 4).setValue(summarize_(type, item));
  sheet.getRange(row, 5).setValue(JSON.stringify(item));
  return item;
}

function deleteItem_(type, id) {
  var sheet = ensureSheet_(type);
  var row = findRow_(sheet, id);
  if (row < 0) return false;
  sheet.deleteRow(row);
  return true;
}
