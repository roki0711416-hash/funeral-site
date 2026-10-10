/**
 * Googleスプレッドシート連携の設定
 *
 * 書き込みできるURLは Git に置かない。
 * 手元の js/local-config.js が先に WEB_APP_URL を入れている場合は、その値を使う。
 * 空のときはブラウザ内（localStorage）だけに保存する。
 *
 * 手順は scripts/henreiya-sheets.gs の先頭コメントを参照。
 */
(function () {
  const existing = window.HenreiyaSheetsConfig && window.HenreiyaSheetsConfig.WEB_APP_URL;
  window.HenreiyaSheetsConfig = {
    WEB_APP_URL: String(existing || '').trim(),
  };
})();
