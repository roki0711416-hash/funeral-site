/* Availability calendar (貸式場のみ) */
(function () {
  'use strict';

  const panel = document.getElementById('calendar-root');
  if (!panel) return;

  const titleEl = document.getElementById('cal-title');
  const gridEl = document.getElementById('cal-grid');
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const dateStart = document.getElementById('desired-date-start');
  const dateEnd = document.getElementById('desired-date-end');
  const dateLegacy = document.getElementById('desired-date');

  let view = new Date();
  view.setDate(1);
  let rangeStart = null;
  let rangeEnd = null;

  function statusFor(y, m, d) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cell = new Date(y, m, d);
    if (cell < today) return 'x';
    const key = toKey(y, m, d);
    const set = window.HenreiyaAvailability && HenreiyaAvailability.getStatus(key);
    if (set === 'x') return 'x';
    if (window.HenreiyaReservationExtra && HenreiyaReservationExtra.coverage) {
      const cover = HenreiyaReservationExtra.coverage(key);
      if (cover === 'full') return 'x';
      if (cover === 'partial') return 't';
    }
    if (set === 't') return 't';
    if (set === 'o') return 'o';
    return 'o';
  }

  function mark(status) {
    if (status === 'o') return { label: '○', cls: 'status-o' };
    if (status === 't') return { label: '△', cls: 'status-t' };
    return { label: '×', cls: 'status-x' };
  }

  function toKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parseKey(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { y, m: m - 1, d };
  }

  function syncInputs() {
    if (dateStart) dateStart.value = rangeStart ? toKey(rangeStart.y, rangeStart.m, rangeStart.d) : '';
    if (dateEnd) dateEnd.value = rangeEnd ? toKey(rangeEnd.y, rangeEnd.m, rangeEnd.d) : '';
    if (dateLegacy) dateLegacy.value = dateStart ? dateStart.value : '';
  }

  function inRange(y, m, d) {
    if (!rangeStart) return false;
    const t = new Date(y, m, d).getTime();
    const a = new Date(rangeStart.y, rangeStart.m, rangeStart.d).getTime();
    if (!rangeEnd) return t === a;
    const b = new Date(rangeEnd.y, rangeEnd.m, rangeEnd.d).getTime();
    return t >= Math.min(a, b) && t <= Math.max(a, b);
  }

  function showDay(key) {
    const box = document.getElementById('day-slots');
    if (!box || !window.HenreiyaReservationExtra) return;
    const rows = HenreiyaReservationExtra.segments(key);
    box.hidden = false;
    box.innerHTML =
      '<strong>' +
      HenreiyaReservationExtra.formatJpDate(key) +
      '</strong>' +
      rows
        .map((row) => {
          const span = HenreiyaReservationExtra.formatMinutes(row.start) + '〜' + HenreiyaReservationExtra.formatMinutes(row.end);
          if (row.kind === 'blocked') return '<div>⚫ 予約不可　' + span + '</div>';
          if (row.kind === 'booked') {
            return '<div>🔴 予約不可　' + span + '</div>';
          }
          return '<div>🟢 予約可能　' + span + '</div>';
        })
        .join('');
  }

  function render() {
    const y = view.getFullYear();
    const m = view.getMonth();
    titleEl.textContent = `${y}年 ${m + 1}月`;

    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const dows = ['日', '月', '火', '水', '木', '金', '土'];
    let html = dows
      .map((d, i) => {
        const cls = i === 0 ? 'cal-dow sun' : i === 6 ? 'cal-dow sat' : 'cal-dow';
        return `<div class="${cls}">${d}</div>`;
      })
      .join('');

    for (let i = 0; i < firstDow; i++) {
      html += '<div class="cal-day is-empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const st = statusFor(y, m, d);
      const mk = mark(st);
      const unavailable = st === 'x';
      const selected = inRange(y, m, d);
      const classes = [
        'cal-day',
        selected ? 'is-selected' : '',
        unavailable ? 'is-unavailable' : '',
      ]
        .filter(Boolean)
        .join(' ');

      html += `<button type="button" class="${classes}" data-y="${y}" data-m="${m}" data-d="${d}" data-status="${st}" ${
        unavailable ? 'disabled' : ''
      }>
        <span class="day-num">${d}</span>
        <span class="day-status ${mk.cls}">${mk.label}</span>
      </button>`;
    }

    gridEl.innerHTML = html;

    gridEl.querySelectorAll('.cal-day:not(.is-empty):not(.is-unavailable)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const picked = {
          y: Number(btn.dataset.y),
          m: Number(btn.dataset.m),
          d: Number(btn.dataset.d),
        };
        if (!rangeStart || (rangeStart && rangeEnd && (rangeStart.y !== rangeEnd.y || rangeStart.m !== rangeEnd.m || rangeStart.d !== rangeEnd.d))) {
          // 新規選択、または既に2日選択済み → 1日からやり直し
          rangeStart = picked;
          rangeEnd = { ...picked };
        } else {
          // 1日選択中 → 隣接日なら2日に拡張、それ以外はやり直し
          const a = new Date(rangeStart.y, rangeStart.m, rangeStart.d).getTime();
          const b = new Date(picked.y, picked.m, picked.d).getTime();
          const diffDays = Math.round(Math.abs(b - a) / 86400000);
          if (diffDays === 1) {
            if (b < a) {
              rangeEnd = rangeStart;
              rangeStart = picked;
            } else {
              rangeEnd = picked;
            }
          } else {
            rangeStart = picked;
            rangeEnd = { ...picked };
          }
        }
        syncInputs();
        render();
        showDay(toKey(picked.y, picked.m, picked.d));
        document.getElementById('day-slots')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  function onManualDateChange() {
    rangeStart = parseKey(dateStart && dateStart.value);
    rangeEnd = parseKey(dateEnd && dateEnd.value) || rangeStart;
    if (rangeStart && rangeEnd) {
      const a = new Date(rangeStart.y, rangeStart.m, rangeStart.d).getTime();
      const b = new Date(rangeEnd.y, rangeEnd.m, rangeEnd.d).getTime();
      if (b < a) {
        const tmp = rangeStart;
        rangeStart = rangeEnd;
        rangeEnd = tmp;
        syncInputs();
      } else if (Math.round((b - a) / 86400000) > 1) {
        rangeEnd = {
          y: rangeStart.y,
          m: rangeStart.m,
          d: rangeStart.d + 1,
        };
        const last = new Date(rangeStart.y, rangeStart.m + 1, 0).getDate();
        if (rangeEnd.d > last) {
          rangeEnd = { y: rangeStart.y, m: rangeStart.m + 1, d: 1 };
        }
        syncInputs();
      }
    }
    render();
  }

  prevBtn?.addEventListener('click', () => {
    view.setMonth(view.getMonth() - 1);
    render();
  });

  nextBtn?.addEventListener('click', () => {
    view.setMonth(view.getMonth() + 1);
    render();
  });

  dateStart?.addEventListener('change', onManualDateChange);
  dateEnd?.addEventListener('change', onManualDateChange);

  render();
  Promise.resolve()
    .then(async () => {
      if (window.HenreiyaStore && HenreiyaStore.refresh) await HenreiyaStore.refresh();
      if (window.HenreiyaReservationExtra && HenreiyaReservationExtra.refresh) await HenreiyaReservationExtra.refresh();
      if (window.HenreiyaAvailability && HenreiyaAvailability.refresh) await HenreiyaAvailability.refresh();
    })
    .then(render)
    .catch(() => {});
})();
