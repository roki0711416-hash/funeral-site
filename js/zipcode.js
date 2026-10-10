/* 郵便番号 → 住所自動入力（zipcloud） */
window.HenreiyaZip = (function () {
  'use strict';

  function digits(zip) {
    return String(zip || '').replace(/\D/g, '');
  }

  function formatZip(zip) {
    const d = digits(zip);
    if (d.length === 7) return d.slice(0, 3) + '-' + d.slice(3);
    return zip;
  }

  async function lookup(zip) {
    const d = digits(zip);
    if (d.length !== 7) return null;
    const res = await fetch(
      'https://zipcloud.ibsnet.co.jp/api/search?zipcode=' + encodeURIComponent(d)
    );
    if (!res.ok) throw new Error('zip lookup failed');
    const data = await res.json();
    if (data.status !== 200 || !data.results || !data.results.length) return null;
    const r = data.results[0];
    return {
      pref: r.address1 || '',
      city: r.address2 || '',
      town: r.address3 || '',
      full: (r.address1 || '') + (r.address2 || '') + (r.address3 || ''),
    };
  }

  /**
   * zipInput に入力したら addrInput を自動補完
   * 番地以降はユーザー入力のため、既存の番地部分は残さない（町名まで上書き）
   */
  function bind(zipInput, addrInput, opts) {
    opts = opts || {};
    const hint = opts.hintEl || null;
    let timer = null;
    let last = '';

    function setHint(msg, isError) {
      if (!hint) return;
      hint.textContent = msg || '';
      hint.hidden = !msg;
      hint.classList.toggle('is-error', !!isError);
    }

    async function run() {
      const raw = zipInput.value;
      const d = digits(raw);
      if (d.length === 7 && raw !== formatZip(raw)) {
        zipInput.value = formatZip(raw);
      }
      if (d.length !== 7) {
        if (d.length > 0) setHint('郵便番号は7桁で入力してください', false);
        else setHint('', false);
        return;
      }
      if (d === last) return;
      last = d;
      setHint('住所を検索中…', false);
      try {
        const found = await lookup(d);
        if (!found) {
          setHint('該当する住所が見つかりませんでした', true);
          return;
        }
        addrInput.value = found.full;
        addrInput.focus();
        const len = addrInput.value.length;
        addrInput.setSelectionRange(len, len);
        setHint('住所を入力しました。番地・建物名を続けてご記入ください。', false);
        if (typeof opts.onFound === 'function') opts.onFound(found);
      } catch (e) {
        setHint('住所の取得に失敗しました。手入力してください。', true);
      }
    }

    zipInput.addEventListener('input', () => {
      clearTimeout(timer);
      const d = digits(zipInput.value);
      if (d.length === 7) timer = setTimeout(run, 280);
      else {
        last = '';
        setHint(d.length ? '郵便番号は7桁で入力してください' : '', false);
      }
    });
    zipInput.addEventListener('blur', () => {
      clearTimeout(timer);
      run();
    });
  }

  return { lookup, formatZip, bind, digits };
})();
