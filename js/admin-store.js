/* Shared data store — localStorage + optional Google Sheets sync */
window.HenreiyaStore = (function () {
  'use strict';

  const KEYS = {
    reservations: 'henreiya_reservations',
    orders: 'henreiya_orders',
    inquiries: 'henreiya_inquiries',
    seeded: 'henreiya_admin_seeded',
  };

  const TYPE_KEY = {
    reservations: KEYS.reservations,
    orders: KEYS.orders,
    inquiries: KEYS.inquiries,
  };

  function sheetsUrl() {
    const cfg = window.HenreiyaSheetsConfig || {};
    return (cfg.WEB_APP_URL || '').trim();
  }

  function sheetsEnabled() {
    return Boolean(sheetsUrl());
  }

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }

  function write(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
  }

  function uid(prefix) {
    return (
      prefix +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function nowISO() {
    return new Date().toISOString();
  }

  async function sheetsGet(params) {
    const base = sheetsUrl();
    if (!base) throw new Error('sheets url missing');
    const q = new URLSearchParams(params).toString();
    const res = await fetch(base + (base.includes('?') ? '&' : '?') + q, {
      method: 'GET',
      redirect: 'follow',
    });
    const data = await res.json();
    if (!data || data.ok === false) {
      throw new Error((data && data.error) || 'sheets get failed');
    }
    return data;
  }

  async function sheetsPost(body) {
    const base = sheetsUrl();
    if (!base) throw new Error('sheets url missing');
    // text/plain にして CORS プリフライトを避ける（Apps Script 定石）
    const res = await fetch(base, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data || data.ok === false) {
      throw new Error((data && data.error) || 'sheets post failed');
    }
    return data;
  }

  /** スプレッドシートから全件取得して localStorage に反映 */
  async function refresh() {
    if (!sheetsEnabled()) return { ok: true, source: 'local' };
    try {
      const data = await sheetsGet({ action: 'listAll' });
      if (Array.isArray(data.reservations)) write(KEYS.reservations, data.reservations);
      if (Array.isArray(data.orders)) write(KEYS.orders, data.orders);
      if (Array.isArray(data.inquiries)) write(KEYS.inquiries, data.inquiries);
      return { ok: true, source: 'sheets' };
    } catch (err) {
      console.warn('[HenreiyaStore] sheets refresh failed', err);
      return { ok: false, source: 'local', error: String(err) };
    }
  }

  function sortByCreated(list) {
    return list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getReservations() {
    return sortByCreated(read(KEYS.reservations));
  }

  function getOrders() {
    return sortByCreated(read(KEYS.orders));
  }

  function getInquiries() {
    return sortByCreated(
      read(KEYS.inquiries).filter(
        (item) =>
          item &&
          item.id !== 'availability-map' &&
          item.status !== 'catalog' &&
          item.catalogKind == null &&
          String(item.id || '').indexOf('catalog-') !== 0
      )
    );
  }

  async function createItem(type, prefix, data) {
    const item = {
      id: uid(prefix),
      status: 'new',
      createdAt: nowISO(),
      ...data,
    };
    const key = TYPE_KEY[type];
    const list = read(key);
    list.push(item);
    write(key, list);

    if (sheetsEnabled()) {
      try {
        await sheetsPost({ action: 'create', type, item });
      } catch (err) {
        console.warn('[HenreiyaStore] sheets create failed', err);
        item._syncError = String(err);
      }
    }
    return item;
  }

  async function patchItem(type, id, patch) {
    const key = TYPE_KEY[type];
    const list = read(key);
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, updatedAt: nowISO() };
    write(key, list);

    if (sheetsEnabled()) {
      try {
        await sheetsPost({ action: 'update', type, id, patch });
        delete list[i]._syncError;
        write(key, list);
      } catch (err) {
        console.warn('[HenreiyaStore] sheets update failed', err);
        list[i]._syncError = (err && err.message) || String(err);
        write(key, list);
      }
    }
    return list[i];
  }

  async function removeItem(type, id) {
    const key = TYPE_KEY[type];
    write(
      key,
      read(key).filter((x) => x.id !== id)
    );
    if (sheetsEnabled()) {
      try {
        await sheetsPost({ action: 'delete', type, id });
      } catch (err) {
        console.warn('[HenreiyaStore] sheets delete failed', err);
      }
    }
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseYmd(str) {
    const m = String(str || '').match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
  }

  function reservationRange(item) {
    const raw = String(item.date || '');
    const parts = raw.split(/\s*[~〜]\s*/);
    let start = parseYmd(item.dateStart) || parseYmd(parts[0]);
    let end = parseYmd(item.dateEnd) || parseYmd(parts[1]) || start;
    if (start && end && start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    return { start: start, end: end };
  }

  function toMinutes(value) {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function sameFacility(a, b) {
    const norm = (value) => {
      const s = String(value || '');
      if (!s || s === 'hall' || s === '貸式場') return 'hall';
      return s;
    };
    return norm(a) === norm(b);
  }

  function timesOverlap(aStart, aEnd, bStart, bEnd) {
    if (aStart == null || aEnd == null || bStart == null || bEnd == null) return true;
    return aStart < bEnd && bStart < aEnd;
  }

  function findReservationConflict(candidate, ignoreId) {
    const nextRange = reservationRange(candidate);
    const nextStart = toMinutes(candidate.timeStart);
    const nextEnd = toMinutes(candidate.timeEnd);
    if (!nextRange.start) return null;
    const list = read(KEYS.reservations);
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item || item.status === 'cancelled') continue;
      if (ignoreId && item.id === ignoreId) continue;
      if (!sameFacility(item.facility, candidate.facility)) continue;
      const range = reservationRange(item);
      if (!range.start) continue;
      if (range.end < nextRange.start || nextRange.end < range.start) continue;
      if (
        timesOverlap(
          toMinutes(item.timeStart),
          toMinutes(item.timeEnd),
          nextStart,
          nextEnd
        )
      ) {
        return item;
      }
    }
    return null;
  }

  function addReservation(data) {
    return createItem('reservations', 'R', data);
  }
  function updateReservation(id, patch) {
    return patchItem('reservations', id, patch);
  }
  function deleteReservation(id) {
    return removeItem('reservations', id);
  }

  function addOrder(data) {
    return createItem('orders', 'O', data);
  }
  function updateOrder(id, patch) {
    return patchItem('orders', id, patch);
  }
  function deleteOrder(id) {
    return removeItem('orders', id);
  }

  function addInquiry(data) {
    return createItem('inquiries', 'I', data);
  }
  function updateInquiry(id, patch) {
    return patchItem('inquiries', id, patch);
  }
  function deleteInquiry(id) {
    return removeItem('inquiries', id);
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatPrice(n) {
    return Number(n || 0).toLocaleString('ja-JP') + '円';
  }

  const STATUS_LABEL = {
    new: '新規',
    awaiting_payment: '入金待ち',
    confirmed: '確認済',
    in_progress: '対応中',
    completed: '完了',
    cancelled: 'キャンセル',
    shipped: '発送済',
  };

  const RESERVATION_STATUS = {
    new: '仮予約',
    confirmed: '予約確定',
    in_progress: '利用中',
    completed: '利用終了',
    cancelled: 'キャンセル',
  };

  function statusLabel(s) {
    return STATUS_LABEL[s] || s;
  }

  function reservationStatusLabel(s) {
    return RESERVATION_STATUS[s] || statusLabel(s);
  }

  function isSheetsEnabled() {
    return sheetsEnabled();
  }

  /** デモデータは Sheets 未設定時のみ投入 */
  function ensureSeed() {
    if (sheetsEnabled()) return;
    if (localStorage.getItem(KEYS.seeded)) return;
    if (!read(KEYS.reservations).length) {
      write(KEYS.reservations, [
        {
          id: 'R-demo-001',
          status: 'new',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          facility: '貸式場',
          date: '2026-10-05',
          timeStart: '10:00',
          timeEnd: '14:00',
          company: 'サンプル葬儀社',
          name: '山田 太郎',
          tel: '090-0000-0000',
          email: 'yamada@example.com',
          note: '参列予定 30名',
        },
      ]);
    }
    if (!read(KEYS.orders).length) {
      write(KEYS.orders, [
        {
          id: 'O-demo-001',
          status: 'new',
          createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
          name: '鈴木 一郎',
          tel: '090-3333-4444',
          email: 'sample@example.com',
          zip: '252-1101',
          addr: '神奈川県綾瀬市サンプル1-2-3',
          shipName: '鈴木 花子',
          shipTel: '090-5555-6666',
          shipZip: '252-1102',
          shipAddr: '神奈川県綾瀬市サンプル4-5-6',
          note: '',
          items: [{ id: 'j-fukamushi', name: '静岡深蒸し茶セット', price: 3240, qty: 10 }],
          total: 32400,
        },
      ]);
    }
    if (!read(KEYS.inquiries).length) {
      write(KEYS.inquiries, [
        {
          id: 'I-demo-001',
          status: 'new',
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          name: '田中 美咲',
          company: '',
          tel: '0467-98-7190',
          email: 'tanaka@example.com',
          message: '施設見学の予約を希望します。',
        },
      ]);
    }
    localStorage.setItem(KEYS.seeded, '1');
  }

  return {
    refresh,
    isSheetsEnabled,
    getReservations,
    addReservation,
    findReservationConflict,
    updateReservation,
    deleteReservation,
    getOrders,
    addOrder,
    updateOrder,
    deleteOrder,
    getInquiries,
    addInquiry,
    updateInquiry,
    deleteInquiry,
    formatDateTime,
    formatPrice,
    statusLabel,
    reservationStatusLabel,
    ensureSeed,
  };
})();
