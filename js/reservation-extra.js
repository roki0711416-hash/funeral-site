/* 予約の時間帯、予約不可、操作履歴。既存の予約レコードは変更しない。 */
window.HenreiyaReservationExtra = (function () {
  'use strict';

  const BLOCKS_ID = 'reservation-blocks';
  const LOGS_ID = 'reservation-logs';
  const BLOCKS_KEY = 'henreiya_reservation_blocks';
  const LOGS_KEY = 'henreiya_reservation_logs';

  function sheetsUrl() {
    const cfg = window.HenreiyaSheetsConfig || {};
    return (cfg.WEB_APP_URL || '').trim();
  }

  function readJson(key) {
    try {
      if (typeof localStorage === 'undefined') return [];
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(data) ? data : [];
    } catch (err) {
      return [];
    }
  }

  function writeJson(key, list) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(list));
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toMinutes(value) {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    if (mins < 0 || mins > 1440) return null;
    return mins;
  }

  function formatMinutes(mins) {
    if (mins === 1440) return '24:00';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return pad(h) + ':' + pad(m);
  }

  function formatJpDate(ymd) {
    const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd || '';
    return Number(m[2]) + '月' + Number(m[3]) + '日';
  }

  function timeChoices(kind) {
    const list = [];
    const from = kind === 'end' ? 30 : 0;
    const to = kind === 'end' ? 1440 : 1410;
    for (let mins = from; mins <= to; mins += 30) list.push(formatMinutes(mins));
    return list;
  }

  function parseYmd(str) {
    const m = String(str || '').match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  }

  function rangeOf(item) {
    const raw = String((item && item.date) || '');
    const parts = raw.split(/\s*[~〜]\s*/);
    let start = parseYmd(item && item.dateStart) || parseYmd(parts[0]);
    let end = parseYmd(item && item.dateEnd) || parseYmd(parts[1]) || start;
    if (start && end && start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }
    return { start: start, end: end };
  }

  function datesBetween(start, end) {
    if (!start) return [];
    const last = end || start;
    const dates = [];
    const cur = new Date(start + 'T00:00:00');
    const stop = new Date(last + 'T00:00:00');
    if (Number.isNaN(cur.getTime()) || Number.isNaN(stop.getTime())) return [];
    while (cur <= stop && dates.length < 14) {
      dates.push(cur.getFullYear() + '-' + pad(cur.getMonth() + 1) + '-' + pad(cur.getDate()));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  function reservationSlices(item, date) {
    if (!item || item.status === 'cancelled') return [];
    const range = rangeOf(item);
    if (!range.start || date < range.start || date > range.end) return [];
    const startMin = toMinutes(item.timeStart);
    const endMin = toMinutes(item.timeEnd);
    if (startMin == null || endMin == null || endMin <= startMin) return [];
    return [{ start: startMin, end: endMin, kind: 'booked', item: item }];
  }

  function blocks() {
    return readJson(BLOCKS_KEY);
  }

  function logs() {
    return readJson(LOGS_KEY);
  }

  function blockSlices(date) {
    return blocks()
      .filter((block) => block && block.date === date)
      .map((block) => ({
        start: toMinutes(block.timeStart),
        end: toMinutes(block.timeEnd),
        kind: 'blocked',
        block: block,
      }))
      .filter((slice) => slice.start != null && slice.end != null && slice.end > slice.start);
  }

  function closedDaySlice(date) {
    if (!window.HenreiyaAvailability || !HenreiyaAvailability.getStatus) return [];
    if (HenreiyaAvailability.getStatus(date) !== 'x') return [];
    return [{ start: 0, end: 1440, kind: 'blocked', block: { id: 'availability:' + date, date: date, timeStart: '00:00', timeEnd: '24:00', reason: '空き状況で予約不可', legacy: true } }];
  }

  function activeReservations() {
    if (!window.HenreiyaStore || !HenreiyaStore.getReservations) return [];
    return HenreiyaStore.getReservations().filter((item) => item && item.status !== 'cancelled');
  }

  function busyOn(date, ignoreId) {
    const rows = [];
    activeReservations().forEach((item) => {
      if (ignoreId && item.id === ignoreId) return;
      reservationSlices(item, date).forEach((slice) => rows.push(slice));
    });
    blockSlices(date).forEach((slice) => rows.push(slice));
    closedDaySlice(date).forEach((slice) => rows.push(slice));
    return rows;
  }

  function segments(date) {
    const busy = busyOn(date);
    const points = [0, 1440];
    busy.forEach((slice) => {
      points.push(slice.start, slice.end);
    });
    const marks = [...new Set(points)].filter((n) => n >= 0 && n <= 1440).sort((a, b) => a - b);
    const pieces = [];
    for (let i = 0; i < marks.length - 1; i++) {
      const start = marks[i];
      const end = marks[i + 1];
      if (end <= start) continue;
      const mid = start + (end - start) / 2;
      const hit = busy.filter((slice) => slice.start <= mid && mid < slice.end);
      if (!hit.length) {
        pieces.push({ start: start, end: end, kind: 'open' });
        continue;
      }
      hit.forEach((slice) => {
        pieces.push({ start: start, end: end, kind: slice.kind, item: slice.item, block: slice.block });
      });
    }
    return pieces.length ? pieces : [{ start: 0, end: 1440, kind: 'open' }];
  }

  function coverage(date) {
    const rows = segments(date);
    const open = rows.filter((row) => row.kind === 'open').reduce((sum, row) => sum + (row.end - row.start), 0);
    const booked = rows.some((row) => row.kind === 'booked');
    const blocked = rows.some((row) => row.kind === 'blocked');
    if (open <= 0 && (booked || blocked)) return 'full';
    if (booked || blocked) return 'partial';
    return 'open';
  }

  function candidateSlices(payload) {
    const item = {
      date: payload.date,
      dateStart: payload.dateStart,
      dateEnd: payload.dateEnd || payload.dateStart,
      timeStart: payload.timeStart,
      timeEnd: payload.timeEnd,
      status: 'new',
    };
    const range = rangeOf(item);
    const out = [];
    datesBetween(range.start, range.end).forEach((date) => {
      reservationSlices(item, date).forEach((slice) => out.push(Object.assign({ date: date }, slice)));
    });
    return out;
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function problem(payload, ignoreId) {
    if (!payload || !payload.dateStart || !payload.timeStart || !payload.timeEnd) return '';
    const startMin = toMinutes(payload.timeStart);
    const endMin = toMinutes(payload.timeEnd);
    if (startMin == null || endMin == null) return '時刻を選んでください。';
    const sameDay = (payload.dateEnd || payload.dateStart) === payload.dateStart;
    if (sameDay && endMin <= startMin) return '終了時刻は開始時刻より後を選んでください。';
    const slices = candidateSlices(payload);
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      const busy = busyOn(slice.date, ignoreId);
      for (let j = 0; j < busy.length; j++) {
        if (!overlaps(slice.start, slice.end, busy[j].start, busy[j].end)) continue;
        if (busy[j].kind === 'blocked') {
          const reason = busy[j].block && busy[j].block.reason ? '（' + busy[j].block.reason + '）' : '';
          return 'この時間は予約を受け付けていません' + reason + '。';
        }
        return 'この時間はすでに予約が入っています。別の時間を選んでください。';
      }
    }
    return '';
  }

  function blockProblem(block, ignoreId) {
    const startMin = toMinutes(block.timeStart);
    const endMin = toMinutes(block.timeEnd);
    if (!block.date || startMin == null || endMin == null) return '日付と時間を入力してください。';
    if (endMin <= startMin) return '終了時刻は開始時刻より後にしてください。';
    const reservations = busyOn(block.date).filter((slice) => slice.kind === 'booked');
    for (let i = 0; i < reservations.length; i++) {
      if (overlaps(startMin, endMin, reservations[i].start, reservations[i].end)) {
        const item = reservations[i].item || {};
        const who = item.company || item.souka || '既存の予約';
        return '既存の予約と重なります（' + who + ' ' + formatMinutes(reservations[i].start) + '〜' + formatMinutes(reservations[i].end) + '）。予約はそのまま残し、この時間は予約不可にしません。';
      }
    }
    const others = blocks().filter((row) => row.id !== ignoreId && row.date === block.date);
    for (let i = 0; i < others.length; i++) {
      const a = toMinutes(others[i].timeStart);
      const b = toMinutes(others[i].timeEnd);
      if (a == null || b == null) continue;
      if (overlaps(startMin, endMin, a, b)) return 'すでに予約不可の時間と重なっています。時間を変えてください。';
    }
    return '';
  }

  async function sheetsGet(params) {
    const base = sheetsUrl();
    const q = new URLSearchParams(params).toString();
    const res = await fetch(base + (base.includes('?') ? '&' : '?') + q, { method: 'GET', redirect: 'follow' });
    const data = await res.json();
    if (!data || data.ok === false) throw new Error((data && data.error) || 'sheets get failed');
    return data;
  }

  async function sheetsPost(body) {
    const res = await fetch(sheetsUrl(), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data || data.ok === false) throw new Error((data && data.error) || 'sheets post failed');
    return data;
  }

  async function persistRow(id, record) {
    if (!sheetsUrl()) return;
    const patch = Object.assign({ status: 'catalog' }, record);
    try {
      await sheetsPost({ action: 'update', type: 'inquiries', id: id, patch: patch });
    } catch (err) {
      if (!/not found/i.test(String(err && err.message))) throw err;
      await sheetsPost({
        action: 'create',
        type: 'inquiries',
        item: Object.assign({ id: id, createdAt: new Date().toISOString() }, patch),
      });
    }
  }

  async function refresh() {
    if (!sheetsUrl()) return { blocks: blocks(), logs: logs() };
    const data = await sheetsGet({ action: 'list', type: 'inquiries' });
    const items = data.items || [];
    const blockRow = items.find((row) => row && row.id === BLOCKS_ID);
    const logRow = items.find((row) => row && row.id === LOGS_ID);
    if (blockRow && Array.isArray(blockRow.blocks)) writeJson(BLOCKS_KEY, blockRow.blocks);
    if (logRow && Array.isArray(logRow.logs)) writeJson(LOGS_KEY, logRow.logs);
    return { blocks: blocks(), logs: logs() };
  }

  async function saveBlocks(next) {
    writeJson(BLOCKS_KEY, next);
    await persistRow(BLOCKS_ID, {
      name: '（システム）予約不可',
      message: '予約を止めている時間です。お問い合わせではありません。',
      catalogKind: 'blocks',
      blocks: next,
    });
    return next;
  }

  async function saveLogs(next) {
    writeJson(LOGS_KEY, next);
    await persistRow(LOGS_ID, {
      name: '（システム）予約履歴',
      message: '予約の操作履歴です。お問い合わせではありません。',
      catalogKind: 'reservationLog',
      logs: next,
    });
    return next;
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  async function addBlock(block) {
    const warning = blockProblem(block);
    if (warning) return { ok: false, error: warning };
    const next = blocks().slice();
    next.push({
      id: uid('rb'),
      date: block.date,
      timeStart: block.timeStart,
      timeEnd: block.timeEnd,
      reason: String(block.reason || '').trim(),
      createdAt: new Date().toISOString(),
      by: block.by || '',
    });
    await saveBlocks(next);
    return { ok: true };
  }

  async function updateBlock(id, patch) {
    const current = blocks().find((row) => row.id === id);
    if (!current) return { ok: false, error: '予約不可が見つかりません。' };
    const nextBlock = Object.assign({}, current, patch, { id: id });
    const warning = blockProblem(nextBlock, id);
    if (warning) return { ok: false, error: warning };
    const next = blocks().map((row) => (row.id === id ? nextBlock : row));
    await saveBlocks(next);
    return { ok: true, block: nextBlock };
  }

  async function removeBlock(id) {
    const current = blocks().find((row) => row.id === id) || null;
    await saveBlocks(blocks().filter((row) => row.id !== id));
    return current;
  }

  async function addLog(entry) {
    const row = Object.assign(
      {
        id: uid('rl'),
        at: new Date().toISOString(),
        actor: '',
      },
      entry
    );
    const next = [row].concat(logs());
    await saveLogs(next);
    return row;
  }

  return {
    refresh: refresh,
    blocks: blocks,
    logs: logs,
    latest: function (count) {
      return logs().slice(0, count || 5);
    },
    segments: segments,
    coverage: coverage,
    problem: problem,
    blockProblem: blockProblem,
    addBlock: addBlock,
    updateBlock: updateBlock,
    removeBlock: removeBlock,
    addLog: addLog,
    timeChoices: timeChoices,
    formatMinutes: formatMinutes,
    formatJpDate: formatJpDate,
    toMinutes: toMinutes,
  };
})();
