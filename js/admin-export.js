/* Excel（.xls / SpreadsheetML）出力 — 外部ライブラリ不要 */
window.AdminExport = (function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cell(v) {
    const s = String(v == null ? '' : v);
    if (s !== '' && !isNaN(s) && /^-?\d+(\.\d+)?$/.test(s)) {
      return `<Cell><Data ss:Type="Number">${esc(s)}</Data></Cell>`;
    }
    return `<Cell><Data ss:Type="String">${esc(s)}</Data></Cell>`;
  }

  function sheetXml(sheetName, headers, rows) {
    const headerRow =
      '<Row>' + headers.map((h) => cell(h)).join('') + '</Row>';
    const dataRows = rows
      .map((row) => '<Row>' + row.map((v) => cell(v)).join('') + '</Row>')
      .join('');
    const safeName = String(sheetName || 'Sheet1').slice(0, 31);
    return `
<Worksheet ss:Name="${esc(safeName)}">
  <Table>
    ${headerRow}
    ${dataRows}
  </Table>
</Worksheet>`;
  }

  function buildWorkbook(sheets) {
    const body = sheets
      .map((s) => sheetXml(s.name, s.headers, s.rows))
      .join('\n');
    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${body}
</Workbook>`;
  }

  function download(filename, xml) {
    const blob = new Blob([xml], {
      type: 'application/vnd.ms-excel;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.xls') ? filename : filename + '.xls';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      p(d.getMonth() + 1) +
      p(d.getDate()) +
      '_' +
      p(d.getHours()) +
      p(d.getMinutes())
    );
  }

  /** '2026-09' → '2026年9月' */
  function monthLabel(key) {
    if (!key || !/^\d{4}-\d{2}$/.test(key)) return '月不明';
    const [y, m] = key.split('-');
    return y + '年' + Number(m) + '月';
  }

  function monthKeyFromDate(value) {
    if (!value) return '';
    const s = String(value).trim();
    const m = s.match(/(\d{4})[-/年](\d{1,2})/);
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0');
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
    return '';
  }

  /** 予約：希望日（開始）優先、なければ受付日時 */
  function reservationMonthKey(r) {
    return (
      monthKeyFromDate(r.dateStart) ||
      monthKeyFromDate(String(r.date || '').split(/[~〜]/)[0]) ||
      monthKeyFromDate(r.createdAt) ||
      'unknown'
    );
  }

  /** 注文：受付日時ベース */
  function orderMonthKey(o) {
    return monthKeyFromDate(o.createdAt) || 'unknown';
  }

  function collectMonthKeys(list, keyFn) {
    const set = new Set();
    list.forEach((item) => {
      const k = keyFn(item);
      if (k) set.add(k);
    });
    return Array.from(set).sort().reverse();
  }

  function groupByMonth(list, keyFn) {
    const map = new Map();
    list.forEach((item) => {
      const k = keyFn(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }

  function reservationRows(list) {
    return list.map((r) => [
      HenreiyaStore.formatDateTime(r.createdAt),
      r.id || '',
      HenreiyaStore.reservationStatusLabel
        ? HenreiyaStore.reservationStatusLabel(r.status)
        : HenreiyaStore.statusLabel(r.status),
      r.facility || '',
      r.date || '',
      r.dateStart || '',
      r.dateEnd || '',
      r.timeStart || '',
      r.timeEnd || '',
      r.souka || '',
      r.company || '',
      r.name || '',
      r.tel || '',
      r.email || '',
      r.note || '',
    ]);
  }

  function orderRows(list) {
    return list.map((o) => {
      const items = (o.items || [])
        .map((i) => `${i.name}×${i.qty}`)
        .join('、');
      let ships = '';
      if (o.shipments && o.shipments.length) {
        ships = o.shipments
          .map((s, idx) => {
            const sItems = (s.items || [])
              .map((it) => `${it.name}×${it.qty}`)
              .join('・');
            return `【送り先${idx + 1}】${s.shipName || ''} ${s.shipTel || ''} 〒${s.shipZip || ''} ${s.shipAddr || ''} 商品:${sItems}`;
          })
          .join(' / ');
      } else {
        ships = `〒${o.shipZip || o.zip || ''} ${o.shipAddr || o.addr || ''} ${o.shipName || ''} ${o.shipTel || ''}`;
      }
      return [
        HenreiyaStore.formatDateTime(o.createdAt),
        o.id || '',
        HenreiyaStore.statusLabel(o.status),
        o.paymentMethod === 'bank_transfer' || !o.paymentMethod
          ? '銀行振込'
          : o.paymentMethod,
        o.name || '',
        o.tel || '',
        o.email || '',
        o.purpose || (o.purposes || []).join('、') || '',
        o.noshiType || '',
        o.relation || '',
        o.deceasedName || '',
        o.kaimyo || '',
        o.shipMonth || '',
        o.mournerName || '',
        [o.mournerZip ? '〒' + o.mournerZip : '', o.mournerPref || '', o.mournerAddr || ''].filter(Boolean).join(' '),
        o.shipCount || (o.shipments ? o.shipments.length : 1) || 1,
        items,
        o.total != null ? o.total : '',
        o.note || '',
        ships,
      ];
    });
  }

  const RES_HEADERS = [
    '受付日時',
    'ID',
    '状態',
    '施設',
    '希望日',
    '開始日',
    '終了日',
    '開始時間',
    '終了時間',
    '葬家名',
    '葬儀社名',
    '担当者名',
    '電話番号',
    'メール',
    'ご要望',
  ];

  const ORDER_HEADERS = [
    '受付日時',
    'ID',
    '状態',
    '支払方法',
    '注文者名',
    '電話',
    'メール',
    'ご用途',
    'のし用紙',
    '続柄',
    '故人名',
    '戒名',
    '発送月',
    '喪主名',
    '喪主住所',
    '送り先数',
    '商品内訳',
    '合計金額',
    '備考',
    '送り先詳細',
  ];

  /**
   * @param {Array} list
   * @param {{ month?: string }} [opts] month='2026-09' で単月、未指定/all なら月ごとシート
   */
  function exportReservations(list, opts) {
    opts = opts || {};
    const month = opts.month && opts.month !== 'all' ? opts.month : '';
    let sheets;
    if (month) {
      const filtered = list.filter((r) => reservationMonthKey(r) === month);
      sheets = [
        {
          name: monthLabel(month),
          headers: RES_HEADERS,
          rows: reservationRows(filtered),
        },
      ];
      download(
        '予約_' + monthLabel(month) + '_' + stamp() + '.xls',
        buildWorkbook(sheets)
      );
      return;
    }
    const groups = groupByMonth(list, reservationMonthKey);
    if (!groups.length) {
      sheets = [{ name: '予約一覧', headers: RES_HEADERS, rows: [] }];
    } else {
      sheets = groups.map(([key, items]) => ({
        name: monthLabel(key),
        headers: RES_HEADERS,
        rows: reservationRows(items),
      }));
    }
    download('予約一覧_月別_' + stamp() + '.xls', buildWorkbook(sheets));
  }

  function exportOrders(list, opts) {
    opts = opts || {};
    const month = opts.month && opts.month !== 'all' ? opts.month : '';
    let sheets;
    if (month) {
      const filtered = list.filter((o) => orderMonthKey(o) === month);
      sheets = [
        {
          name: monthLabel(month),
          headers: ORDER_HEADERS,
          rows: orderRows(filtered),
        },
      ];
      download(
        '注文_' + monthLabel(month) + '_' + stamp() + '.xls',
        buildWorkbook(sheets)
      );
      return;
    }
    const groups = groupByMonth(list, orderMonthKey);
    if (!groups.length) {
      sheets = [{ name: '注文一覧', headers: ORDER_HEADERS, rows: [] }];
    } else {
      sheets = groups.map(([key, items]) => ({
        name: monthLabel(key),
        headers: ORDER_HEADERS,
        rows: orderRows(items),
      }));
    }
    download('注文一覧_月別_' + stamp() + '.xls', buildWorkbook(sheets));
  }

  return {
    exportReservations,
    exportOrders,
    monthLabel,
    monthKeyFromDate,
    reservationMonthKey,
    orderMonthKey,
    collectMonthKeys,
  };
})();
