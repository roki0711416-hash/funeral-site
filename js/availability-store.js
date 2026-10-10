/* 貸式場の空き状況。公開カレンダーと管理画面で共有する。
   既存のスプレッドシート連携（お問い合わせシート）に専用1件として保存する。 */
window.HenreiyaAvailability = (function () {
  'use strict';

  const MAP_ID = 'availability-map';
  const KEY = 'henreiya_availability';
  const STATUSES = ['o', 't', 'x'];

  function sheetsUrl() {
    const cfg = window.HenreiyaSheetsConfig || {};
    return (cfg.WEB_APP_URL || '').trim();
  }

  function readMap() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  function writeMap(map) {
    localStorage.setItem(KEY, JSON.stringify(map));
  }

  async function sheetsGet(params) {
    const base = sheetsUrl();
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

  function normalize(raw) {
    const map = {};
    if (!raw || typeof raw !== 'object') return map;
    Object.keys(raw).forEach((key) => {
      if (STATUSES.indexOf(raw[key]) >= 0) map[key] = raw[key];
    });
    return map;
  }

  async function refresh() {
    if (!sheetsUrl()) return readMap();
    const data = await sheetsGet({ action: 'list', type: 'inquiries' });
    const item = (data.items || []).find((row) => row && row.id === MAP_ID);
    if (item && item.dates) writeMap(normalize(item.dates));
    return readMap();
  }

  async function persist(map) {
    if (!sheetsUrl()) return { ok: true, source: 'local' };
    const patch = {
      dates: map,
      name: '（システム）空き状況',
      status: 'system',
      message: '公開カレンダー用の設定です。お問い合わせではありません。',
    };
    try {
      await sheetsPost({
        action: 'update',
        type: 'inquiries',
        id: MAP_ID,
        patch: patch,
      });
    } catch (err) {
      if (!/not found/i.test(String(err && err.message))) throw err;
      await sheetsPost({
        action: 'create',
        type: 'inquiries',
        item: Object.assign({ id: MAP_ID, createdAt: new Date().toISOString() }, patch),
      });
    }
    return { ok: true, source: 'sheets' };
  }

  function getStatus(dateKey) {
    const status = readMap()[dateKey];
    return STATUSES.indexOf(status) >= 0 ? status : null;
  }

  function getMap() {
    return readMap();
  }

  async function setStatus(dateKey, status) {
    const map = readMap();
    if (STATUSES.indexOf(status) < 0) delete map[dateKey];
    else map[dateKey] = status;
    writeMap(map);
    return persist(map);
  }

  async function setMany(entries) {
    const map = readMap();
    Object.keys(entries).forEach((key) => {
      const status = entries[key];
      if (STATUSES.indexOf(status) < 0) delete map[key];
      else map[key] = status;
    });
    writeMap(map);
    return persist(map);
  }

  return {
    MAP_ID: MAP_ID,
    refresh: refresh,
    getStatus: getStatus,
    getMap: getMap,
    setStatus: setStatus,
    setMany: setMany,
  };
})();
