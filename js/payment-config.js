/**
 * お支払い設定
 * 口座情報が決まり次第、BANK の各項目を書き換えてください。
 */
window.HenreiyaPayment = {
  methods: {
    bank_transfer: {
      id: 'bank_transfer',
      label: '銀行振込',
    },
  },

  /** ← 後から差し替え */
  BANK: {
    bankName: '（銀行名を記入）',
    branchName: '（支店名を記入）',
    accountType: '普通',
    accountNumber: '（口座番号を記入）',
    accountHolder: 'カ）ヘンレイヤ',
    note: '口座情報は準備でき次第ご案内します。ご不明点はお問い合わせください。',
  },

  paymentLabel(id) {
    return (this.methods[id] && this.methods[id].label) || id || '—';
  },

  bankTransferHtml(opts) {
    opts = opts || {};
    const b = this.BANK;
    const total =
      opts.totalText ||
      (opts.total != null
        ? Number(opts.total).toLocaleString('ja-JP') + '円'
        : '');
    const orderId = opts.orderId || '';
    return `
      <div class="bank-box">
        <p class="bank-box__lead">お支払い方法：<strong>銀行振込</strong></p>
        ${
          total
            ? `<p class="bank-box__amount">お振込金額 <strong>${total}</strong>（税込）</p>`
            : ''
        }
        ${
          orderId
            ? `<p class="bank-box__id">注文番号 <strong>${orderId}</strong><br /><span>振込名義の前または後に注文番号をご記入ください。</span></p>`
            : ''
        }
        <dl class="bank-box__dl">
          <div><dt>金融機関</dt><dd>${b.bankName}</dd></div>
          <div><dt>支店</dt><dd>${b.branchName}</dd></div>
          <div><dt>口座種別</dt><dd>${b.accountType}</dd></div>
          <div><dt>口座番号</dt><dd>${b.accountNumber}</dd></div>
          <div><dt>口座名義</dt><dd>${b.accountHolder}</dd></div>
        </dl>
        <p class="bank-box__note">${b.note}</p>
        <p class="bank-box__note">ご入金確認後、発送手続きを進めます。通常、確認まで1〜2営業日ほどお時間をいただく場合があります。</p>
      </div>
    `;
  },
};
