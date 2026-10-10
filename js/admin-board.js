/* 予約管理画面のカレンダー、時間帯、履歴。 */
window.HenreiyaAdminBoard = (function () {
  'use strict';

  const extra = () => window.HenreiyaReservationExtra;
  let view = new Date();
  let selected = '';
  let ready = false;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function ymd(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function actor() {
    return (window.HenreiyaAuth && HenreiyaAuth.currentUser && HenreiyaAuth.currentUser()) || '';
  }

  function ymdOf(value) {
    const m = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
  }

  function viewMonthKey() {
    return view.getFullYear() + '-' + pad(view.getMonth() + 1);
  }

  function coversDate(item, date) {
    const start = ymdOf(item.dateStart) || ymdOf(item.date);
    const end = ymdOf(item.dateEnd) || start;
    if (!start) return false;
    return date >= start && date <= end;
  }

  function notify(message, isError) {
    const el = document.getElementById('reserve-notice');
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
  }

  function timeSelect(name, kind, value) {
    const options = extra().timeChoices(kind).slice();
    if (value && options.indexOf(value) < 0) options.unshift(value);
    return (
      '<select name="' +
      name +
      '" required>' +
      options
        .map((time) => '<option value="' + time + '"' + (time === value ? ' selected' : '') + '>' + time + '</option>')
        .join('') +
      '</select>'
    );
  }

  function paintCalendar() {
    const title = document.getElementById('board-cal-title');
    const grid = document.getElementById('board-cal-grid');
    if (!title || !grid) return;
    const y = view.getFullYear();
    const m = view.getMonth();
    title.textContent = y + '年 ' + (m + 1) + '月';
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const today = ymd(new Date());
    let html = '';
    for (let i = 0; i < first; i++) html += '<div class="admin-cal__cell is-empty"></div>';
    for (let d = 1; d <= days; d++) {
      const key = y + '-' + pad(m + 1) + '-' + pad(d);
      const cover = extra().coverage(key);
      const classes = ['admin-cal__cell'];
      if (key === today) classes.push('is-today');
      if (key === selected) classes.push('is-selected');
      if (cover === 'full') classes.push('is-closed');
      else if (cover === 'partial') classes.push('is-tight');
      else classes.push('is-open');
      const mark = cover === 'full' ? '●' : cover === 'partial' ? '●' : '';
      html +=
        '<button type="button" class="' +
        classes.join(' ') +
        '" data-date="' +
        key +
        '"><span class="admin-cal__day">' +
        d +
        '</span>' +
        (mark ? '<span class="admin-cal__mark ' + (cover === 'full' ? 'is-x' : 'is-t') + '">' + mark + '</span>' : '') +
        '</button>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('[data-date]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selected = btn.dataset.date;
        paint();
      });
    });
  }

  function lineLabel(row) {
    const span = extra().formatMinutes(row.start) + '〜' + extra().formatMinutes(row.end);
    if (row.kind === 'open') return '<span class="slot-open">🟢 予約可能</span> ' + span;
    if (row.kind === 'blocked') {
      const reason = row.block && row.block.reason ? '　理由：' + esc(row.block.reason) : '';
      return '<span class="slot-block">⚫ 予約不可</span> ' + span + reason;
    }
    const item = row.item || {};
    const who = esc(item.name || item.company || item.souka || '');
    const label =
      window.HenreiyaStore && HenreiyaStore.reservationStatusLabel
        ? HenreiyaStore.reservationStatusLabel(item.status)
        : '予約済み';
    return '<span class="slot-booked">🔴 ' + esc(label) + '</span> ' + span + (who ? '　' + who : '');
  }

  function paintDay() {
    const title = document.getElementById('board-day-title');
    const list = document.getElementById('board-day-list');
    const blocksEl = document.getElementById('board-day-blocks');
    if (!title || !list) return;
    if (!selected) {
      title.textContent = '日付を選択してください';
      list.innerHTML = '<p class="empty-state">カレンダーの日付を押すと、その日の空き状況を表示します。</p>';
      if (blocksEl) blocksEl.innerHTML = '';
      return;
    }
    title.textContent = extra().formatJpDate(selected);
    const rows = extra().segments(selected);
    const cancelled = (window.HenreiyaStore ? HenreiyaStore.getReservations() : []).filter(
      (item) => item && item.status === 'cancelled' && coversDate(item, selected)
    );
    list.innerHTML =
      rows
        .map((row) => {
          if (row.kind === 'booked' && row.item && row.item.id) {
            return (
              '<button type="button" class="slot-row slot-row-btn" data-reservation="' +
              esc(row.item.id) +
              '">' +
              lineLabel(row) +
              '</button>'
            );
          }
          return '<div class="slot-row">' + lineLabel(row) + '</div>';
        })
        .join('') +
      cancelled
        .map(
          (item) =>
            '<button type="button" class="slot-row slot-row-btn is-cancelled-slot" data-reservation="' +
            esc(item.id) +
            '"><span class="slot-cancel">キャンセル</span> ' +
            esc(item.timeStart || '') +
            '〜' +
            esc(item.timeEnd || '') +
            '　' +
            esc(item.name || item.company || '') +
            '</button>'
        )
        .join('');
    list.querySelectorAll('[data-reservation]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.dataset.reservation));
    });
    const dayBlocks = extra().blocks().filter((block) => block.date === selected);
    if (blocksEl) {
      blocksEl.innerHTML = dayBlocks.length
        ? dayBlocks
            .map(
              (block) =>
                '<div class="slot-actions"><span>' +
                esc(block.timeStart) +
                '〜' +
                esc(block.timeEnd) +
                (block.reason ? '　' + esc(block.reason) : '') +
                '</span><button type="button" class="admin-btn admin-btn-ghost" data-edit-block="' +
                esc(block.id) +
                '">変更</button><button type="button" class="admin-btn admin-btn-ghost" data-open-block="' +
                esc(block.id) +
                '">予約受付再開</button></div>'
            )
            .join('')
        : '';
      blocksEl.querySelectorAll('[data-edit-block]').forEach((btn) => {
        btn.addEventListener('click', () => openBlockEditor(btn.dataset.editBlock));
      });
      blocksEl.querySelectorAll('[data-open-block]').forEach((btn) => {
        btn.addEventListener('click', () => resumeBlock(btn.dataset.openBlock));
      });
    }
    const dateInput = document.getElementById('block-date');
    if (dateInput) dateInput.value = selected;
  }

  function logText(entry) {
    const when = extra().formatJpDate(entry.date) + ' ' + (entry.timeStart || '') + '〜' + (entry.timeEnd || '');
    const who = entry.company || entry.reason || '';
    if (entry.type === 'create') return { mark: '🟢 新規予約', line: when, sub: who };
    if (entry.type === 'cancel') return { mark: '🔴 予約キャンセル', line: when, sub: who };
    if (entry.type === 'time') {
      return {
        mark: '🟡 予約時間変更',
        line: extra().formatJpDate(entry.date) + ' ' + entry.before + ' → ' + entry.after,
        sub: who,
      };
    }
    if (entry.type === 'update') return { mark: '🟡 予約変更', line: when, sub: who };
    if (entry.type === 'block') return { mark: '⚫ 予約受付停止', line: when, sub: entry.reason ? '理由：' + entry.reason : '' };
    if (entry.type === 'unblock') return { mark: '🟢 予約受付再開', line: when, sub: entry.reason ? '理由：' + entry.reason : '' };
    return { mark: '予約操作', line: when, sub: who };
  }

  function logHtml(entry) {
    const view = logText(entry);
    const by = entry.actor ? '<span class="log-actor">' + esc(entry.actor) + '</span>' : '';
    return (
      '<article class="reserve-log"><strong>' +
      esc(view.mark) +
      '</strong><p>' +
      esc(view.line) +
      '</p>' +
      (view.sub ? '<p>' + esc(view.sub) + '</p>' : '') +
      by +
      '</article>'
    );
  }

  function paintLogs() {
    const box = document.getElementById('board-logs');
    if (!box) return;
    const rows = extra().latest(5);
    box.innerHTML = rows.length ? rows.map(logHtml).join('') : '<p class="empty-state">操作履歴はまだありません。</p>';
  }

  function paint() {
    paintCalendar();
    paintDay();
    paintLogs();
  }

  function statusField(current) {
    const pairs = [
      ['new', '仮予約'],
      ['confirmed', '予約確定'],
      ['in_progress', '利用中'],
      ['completed', '利用終了'],
      ['cancelled', 'キャンセル'],
    ];
    return (
      '<select name="status">' +
      pairs
        .map(
          (pair) =>
            '<option value="' +
            pair[0] +
            '"' +
            (pair[0] === (current || 'new') ? ' selected' : '') +
            '>' +
            pair[1] +
            '</option>'
        )
        .join('') +
      '</select>'
    );
  }

  function reservationFields(r) {
    r = r || {};
    const startDate = ymdOf(r.dateStart) || ymdOf(r.date) || selected || '';
    const endDate = ymdOf(r.dateEnd) || startDate;
    return `
      <div class="form-row-2">
        <label>予約日<input type="date" name="dateStart" required value="${esc(startDate)}" /></label>
        <label>終了日<input type="date" name="dateEnd" value="${esc(endDate)}" /></label>
      </div>
      <div class="form-row-2">
        <label>開始時間${timeSelect('timeStart', 'start', r.timeStart || '09:00')}</label>
        <label>終了時間${timeSelect('timeEnd', 'end', r.timeEnd || '12:00')}</label>
      </div>
      <label>予約者名<input name="name" value="${esc(r.name || '')}" /></label>
      <label>電話番号<input name="tel" value="${esc(r.tel || '')}" /></label>
      <label>利用内容<input name="usage" value="${esc(r.usage || r.souka || r.facility || '')}" /></label>
      <label>備考<textarea name="note">${esc(r.note || '')}</textarea></label>
      <label>予約状況${statusField(r.status || 'new')}</label>
      <label>葬家名<input name="souka" value="${esc(r.souka || '')}" /></label>
      <label>葬儀社名<input name="company" value="${esc(r.company || '')}" /></label>
      <label>メール<input name="email" type="email" value="${esc(r.email || '')}" /></label>
    `;
  }

  function payloadFrom(form, current) {
    const data = new FormData(form);
    const dateStart = data.get('dateStart') || '';
    const dateEnd = data.get('dateEnd') || dateStart;
    const next = Object.assign({}, current || {}, {
      facility: (current && current.facility) || '貸式場',
      dateStart: dateStart,
      dateEnd: dateEnd,
      date: dateStart === dateEnd ? dateStart : dateStart + ' 〜 ' + dateEnd,
      timeStart: data.get('timeStart') || '',
      timeEnd: data.get('timeEnd') || '',
      souka: data.get('souka') || '',
      company: data.get('company') || '',
      name: data.get('name') || '',
      tel: data.get('tel') || '',
      email: data.get('email') || '',
      usage: data.get('usage') || '',
      note: data.get('note') || '',
      status: data.get('status') || (current && current.status) || 'new',
    });
    delete next._syncError;
    return next;
  }

  function showFormError(message) {
    const error = document.getElementById('reserve-edit-error');
    if (!error) return;
    error.hidden = false;
    error.textContent = message;
  }

  async function saveReservation(current) {
    const form = document.getElementById('reserve-edit-form');
    const payload = payloadFrom(form, current);
    if (payload.status !== 'cancelled') {
      const reason = extra().problem(payload, current && current.id);
      if (reason) {
        showFormError(reason);
        return;
      }
      const conflict = HenreiyaStore.findReservationConflict(payload, current && current.id);
      if (conflict) {
        showFormError('この時間はすでに予約が入っています。別の時間を選んでください。');
        return;
      }
    }
    if (current && payload.status === 'cancelled' && current.status !== 'cancelled') {
      if (!confirm('予約状況をキャンセルにしますか？予約データは履歴に残ります。')) return;
    }
    let saved;
    try {
      saved = current
        ? await HenreiyaStore.updateReservation(current.id, payload)
        : await HenreiyaStore.addReservation(payload);
    } catch (err) {
      showFormError('保存に失敗しました。通信状況を確認して、もう一度保存してください。');
      return;
    }
    if (!saved || saved._syncError) {
      if (HenreiyaStore.refresh) await HenreiyaStore.refresh();
      await afterChange();
      showFormError('保存に失敗しました。通信状況を確認して、もう一度保存してください。');
      return;
    }
    const previousStart = current ? ymdOf(current.dateStart) || ymdOf(current.date) : '';
    const previousEnd = current ? ymdOf(current.dateEnd) || previousStart : '';
    const timeChanged =
      current &&
      (previousStart !== payload.dateStart ||
        previousEnd !== payload.dateEnd ||
        (current.timeStart || '') !== payload.timeStart ||
        (current.timeEnd || '') !== payload.timeEnd);
    let type = 'create';
    if (current && payload.status === 'cancelled' && current.status !== 'cancelled') type = 'cancel';
    else if (current && timeChanged) type = 'time';
    else if (current) type = 'update';
    await extra().addLog({
      type: type,
      date: payload.dateStart,
      timeStart: payload.timeStart,
      timeEnd: payload.timeEnd,
      before: current ? (current.timeStart || '') + '〜' + (current.timeEnd || '') : '',
      after: payload.timeStart + '〜' + payload.timeEnd,
      company: payload.name || payload.company || payload.souka,
      actor: actor(),
      reservationId: saved.id,
    });
    AdminUI.closeModal();
    await afterChange();
    notify(current ? '保存しました。' : '予約を登録しました。', false);
  }

  async function afterChange() {
    paint();
    document.dispatchEvent(new CustomEvent('henreiya-reservations-updated'));
  }

  function openDetail(id) {
    const current = id ? HenreiyaStore.getReservations().find((row) => row.id === id) : null;
    if (id && !current) return;
    AdminUI.openModal(`
      <h3>${current ? '予約詳細' : '新規予約'}</h3>
      <form id="reserve-edit-form" class="form-grid">${reservationFields(current)}</form>
      <p id="reserve-edit-error" class="form-error" hidden></p>
      <div class="admin-modal__actions">
        <button type="button" class="admin-btn admin-btn-primary" id="reserve-edit-save">${current ? '保存する' : '登録する'}</button>
        ${current && current.status !== 'cancelled' ? '<button type="button" class="admin-btn admin-btn-danger" id="reserve-detail-cancel">予約をキャンセル</button>' : ''}
        <button type="button" class="admin-btn admin-btn-ghost" id="close-modal">閉じる</button>
      </div>
    `);
    document.getElementById('close-modal').onclick = AdminUI.closeModal;
    document.getElementById('reserve-edit-save').onclick = () => saveReservation(current);
    const cancelBtn = document.getElementById('reserve-detail-cancel');
    if (cancelBtn) cancelBtn.onclick = () => cancelReservation(current.id);
  }

  function openCreate() {
    openDetail(null);
  }

  async function cancelReservation(id) {
    const current = HenreiyaStore.getReservations().find((row) => row.id === id);
    if (!current || current.status === 'cancelled') return false;
    if (!confirm('この予約をキャンセルしますか？キャンセル後も履歴として残ります。')) return false;
    const saved = await HenreiyaStore.updateReservation(id, { status: 'cancelled' });
    if (!saved || saved._syncError) {
      if (HenreiyaStore.refresh) await HenreiyaStore.refresh();
      await afterChange();
      notify('キャンセルの保存に失敗しました。もう一度操作してください。', true);
      return false;
    }
    await extra().addLog({
      type: 'cancel',
      date: current.dateStart || current.date,
      timeStart: current.timeStart,
      timeEnd: current.timeEnd,
      company: current.name || current.company || current.souka,
      actor: actor(),
      reservationId: id,
    });
    AdminUI.closeModal();
    await afterChange();
    notify('予約をキャンセルしました。この時間は空き枠に戻りました。', false);
    return true;
  }

  function openBlockEditor(id) {
    const current = id ? extra().blocks().find((row) => row.id === id) : null;
    AdminUI.openModal(`
      <h3>${current ? '予約不可の変更' : '予約受付停止'}</h3>
      <form id="block-edit-form" class="form-grid">
        <label>日付<input type="date" name="date" required value="${esc((current && current.date) || selected || '')}" /></label>
        <div class="form-row-2">
          <label>開始${timeSelect('timeStart', 'start', (current && current.timeStart) || '17:00')}</label>
          <label>終了${timeSelect('timeEnd', 'end', (current && current.timeEnd) || '19:00')}</label>
        </div>
        <label>理由<input name="reason" value="${esc((current && current.reason) || '')}" placeholder="例：設備点検" /></label>
      </form>
      <p id="reserve-edit-error" class="form-error" hidden></p>
      <div class="admin-modal__actions">
        <button type="button" class="admin-btn admin-btn-primary" id="block-edit-save">保存する</button>
        <button type="button" class="admin-btn admin-btn-ghost" id="close-modal">閉じる</button>
      </div>
    `);
    document.getElementById('close-modal').onclick = AdminUI.closeModal;
    document.getElementById('block-edit-save').onclick = async () => {
      const data = new FormData(document.getElementById('block-edit-form'));
      const block = {
        date: data.get('date') || '',
        timeStart: data.get('timeStart') || '',
        timeEnd: data.get('timeEnd') || '',
        reason: data.get('reason') || '',
        by: actor(),
      };
      const saved = current ? await extra().updateBlock(current.id, block) : await extra().addBlock(block);
      const error = document.getElementById('reserve-edit-error');
      if (!saved.ok) {
        error.hidden = false;
        error.textContent = saved.error;
        return;
      }
      await extra().addLog({
        type: 'block',
        date: block.date,
        timeStart: block.timeStart,
        timeEnd: block.timeEnd,
        reason: block.reason,
        actor: actor(),
      });
      AdminUI.closeModal();
      selected = block.date;
      await afterChange();
    };
  }

  async function resumeBlock(id) {
    const current = extra().blocks().find((row) => row.id === id);
    if (!current) return;
    if (!confirm('この時間の予約受付を再開しますか？')) return;
    await extra().removeBlock(id);
    await extra().addLog({
      type: 'unblock',
      date: current.date,
      timeStart: current.timeStart,
      timeEnd: current.timeEnd,
      reason: current.reason,
      actor: actor(),
    });
    await afterChange();
  }

  function openHistory() {
    const rows = extra().logs();
    AdminUI.openModal(`
      <h3>操作履歴</h3>
      <div class="reserve-log-list">${rows.length ? rows.map(logHtml).join('') : '<p class="empty-state">履歴はありません。</p>'}</div>
      <div class="admin-modal__actions">
        <button type="button" class="admin-btn admin-btn-ghost" id="close-modal">閉じる</button>
      </div>
    `);
    document.getElementById('close-modal').onclick = AdminUI.closeModal;
  }

  async function start() {
    if (ready) {
      paint();
      return;
    }
    ready = true;
    view.setDate(1);
    selected = ymd(new Date());
    await extra().refresh();
    document.getElementById('board-cal-prev')?.addEventListener('click', () => {
      view.setMonth(view.getMonth() - 1);
      paint();
      document.dispatchEvent(new CustomEvent('henreiya-calendar-month', { detail: viewMonthKey() }));
    });
    document.getElementById('board-cal-next')?.addEventListener('click', () => {
      view.setMonth(view.getMonth() + 1);
      paint();
      document.dispatchEvent(new CustomEvent('henreiya-calendar-month', { detail: viewMonthKey() }));
    });
    document.getElementById('btn-new-reservation')?.addEventListener('click', openCreate);
    document.getElementById('btn-new-block')?.addEventListener('click', () => openBlockEditor(null));
    document.getElementById('btn-all-logs')?.addEventListener('click', openHistory);
    paint();
  }

  function showMonth(key) {
    const matched = String(key || '').match(/^(\d{4})-(\d{2})$/);
    if (!matched) return;
    const year = Number(matched[1]);
    const month = Number(matched[2]) - 1;
    if (view.getFullYear() === year && view.getMonth() === month) return;
    view = new Date(year, month, 1);
    paint();
  }

  return {
    start: start,
    paint: paint,
    openEdit: openDetail,
    openDetail: openDetail,
    cancelReservation: cancelReservation,
    showMonth: showMonth,
    monthKey: viewMonthKey,
  };
})();
