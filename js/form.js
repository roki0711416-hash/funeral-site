/* Reservation form steps */
(function () {
  'use strict';

  const form = document.getElementById('reserve-form');
  if (!form) return;

  const stepEls = document.querySelectorAll('[data-step-panel]');
  const stepIndicators = document.querySelectorAll('.step');
  const stepLines = document.querySelectorAll('.step-line');
  const stepsWrap = document.querySelector('.steps');
  const calendarRoot = document.getElementById('calendar-root');
  const formTitle = document.getElementById('reserve-form-title');
  let current = 0;

  function showStep(n) {
    current = n;
    stepEls.forEach((el) => {
      el.hidden = Number(el.dataset.stepPanel) !== n;
    });
    if (stepsWrap) stepsWrap.hidden = n === 0;
    if (calendarRoot) calendarRoot.hidden = n !== 0;
    if (formTitle) {
      formTitle.textContent =
        n === 0 ? '日付・時間の選択' : n === 3 ? '予約完了' : n === 2 ? '内容の確認' : 'ご予約情報の入力';
    }
    stepIndicators.forEach((el, i) => {
      const num = i + 1;
      el.classList.toggle('is-active', num === n);
      el.classList.toggle('is-done', num < n);
    });
    stepLines.forEach((el, i) => {
      el.classList.toggle('is-done', i + 1 < n);
    });
    if (n === 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: form.offsetTop - 80, behavior: 'smooth' });
  }

  function formatDateRange(start, end) {
    if (!start) return '—';
    if (!end || end === start) return start;
    return `${start} 〜 ${end}`;
  }

  function fillConfirm() {
    const data = new FormData(form);
    const facility = data.get('facility') === 'hall' ? '貸式場' : '安置施設';
    const map = {
      'confirm-facility': facility,
      'confirm-date': formatDateRange(data.get('date_start'), data.get('date_end')),
      'confirm-time': `${data.get('time-start') || '—'} 〜 ${data.get('time-end') || '—'}`,
      'confirm-souka': data.get('souka') || '—',
      'confirm-company': data.get('company') || '—',
      'confirm-name': data.get('name') || '—',
      'confirm-tel': data.get('tel') || '—',
      'confirm-email': data.get('email') || '—',
      'confirm-note': data.get('note') || '（なし）',
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    const picked = document.getElementById('picked-summary');
    if (picked) {
      picked.innerHTML =
        '<p><strong>施設</strong>　' +
        facility +
        '</p><p><strong>希望日</strong>　' +
        map['confirm-date'] +
        '</p><p><strong>ご利用時間</strong>　' +
        map['confirm-time'] +
        '</p>';
    }
    const done = document.getElementById('complete-summary');
    if (done) {
      done.innerHTML =
        '<div><dt>施設</dt><dd>' +
        facility +
        '</dd></div><div><dt>希望日</dt><dd>' +
        map['confirm-date'] +
        '</dd></div><div><dt>ご利用時間</dt><dd>' +
        map['confirm-time'] +
        '</dd></div><div><dt>葬家名</dt><dd>' +
        map['confirm-souka'] +
        '</dd></div><div><dt>葬儀社名</dt><dd>' +
        map['confirm-company'] +
        '</dd></div><div><dt>担当者名</dt><dd>' +
        map['confirm-name'] +
        '</dd></div>';
    }
  }

  function fillTimes() {
    if (!window.HenreiyaReservationExtra) return;
    const start = form.querySelector('[name="time-start"]');
    const end = form.querySelector('[name="time-end"]');
    if (start && start.options.length < 3) {
      HenreiyaReservationExtra.timeChoices('start').forEach((time) => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        start.appendChild(option);
      });
    }
    if (end && end.options.length < 3) {
      HenreiyaReservationExtra.timeChoices('end').forEach((time) => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = time;
        end.appendChild(option);
      });
    }
  }

  function reservationPayload() {
    const data = new FormData(form);
    const dateStart = data.get('date_start') || '';
    const dateEnd = data.get('date_end') || dateStart;
    return {
      facility: data.get('facility') === 'hall' ? '貸式場' : '安置施設',
      date: formatDateRange(dateStart, dateEnd),
      dateStart,
      dateEnd,
      timeStart: data.get('time-start') || '',
      timeEnd: data.get('time-end') || '',
      souka: data.get('souka') || '',
      company: data.get('company') || '',
      name: data.get('name') || '',
      tel: data.get('tel') || '',
      email: data.get('email') || '',
      note: data.get('note') || '',
    };
  }

  function conflictMessage(item) {
    const when = [item.date || item.dateStart || '', item.timeStart && item.timeEnd ? item.timeStart + '〜' + item.timeEnd : '']
      .filter(Boolean)
      .join(' ');
    return when
      ? 'この日時はすでに予約が入っています（' + when + '）。別の日時を選んでください。'
      : 'この日時はすでに予約が入っています。別の日時を選んでください。';
  }

  function updateSlotHint() {
    const hint = document.getElementById('slot-hint');
    if (!hint || typeof HenreiyaStore === 'undefined' || !HenreiyaStore.findReservationConflict) return;
    const payload = reservationPayload();
    if (!payload.dateStart || !payload.timeStart || !payload.timeEnd) {
      hint.textContent = 'すでに予約のある日時は申し込めません。';
      hint.style.color = '';
      return;
    }
    const sameDay = !payload.dateEnd || payload.dateEnd === payload.dateStart;
    if (sameDay && payload.timeEnd <= payload.timeStart) {
      hint.textContent = '終了時刻は開始時刻より後を選んでください。';
      hint.style.color = '#a33b3b';
      return;
    }
    if (window.HenreiyaReservationExtra) {
      const blocked = HenreiyaReservationExtra.problem(payload);
      if (blocked) {
        hint.textContent = blocked;
        hint.style.color = '#a33b3b';
        return;
      }
    }
    const conflict = HenreiyaStore.findReservationConflict(payload);
    if (conflict) {
      hint.textContent = conflictMessage(conflict);
      hint.style.color = '#a33b3b';
      return;
    }
    hint.textContent = 'この日時は申し込めます。';
    hint.style.color = '';
  }

  async function refreshReservations() {
    if (typeof HenreiyaStore === 'undefined' || !HenreiyaStore.refresh) return;
    try {
      await HenreiyaStore.refresh();
      if (window.HenreiyaReservationExtra) await HenreiyaReservationExtra.refresh();
      if (window.HenreiyaAvailability && HenreiyaAvailability.refresh) await HenreiyaAvailability.refresh();
    } catch (err) {
      console.warn(err);
    }
  }

  async function bookingBlockReason() {
    const payload = reservationPayload();
    if (payload.timeStart && payload.timeEnd && payload.dateStart === (payload.dateEnd || payload.dateStart)) {
      const startMin = window.HenreiyaReservationExtra && HenreiyaReservationExtra.toMinutes(payload.timeStart);
      const endMin = window.HenreiyaReservationExtra && HenreiyaReservationExtra.toMinutes(payload.timeEnd);
      if (startMin != null && endMin != null && endMin <= startMin) {
        return '終了時刻は開始時刻より後を選んでください。';
      }
    }
    await refreshReservations();
    if (window.HenreiyaReservationExtra) {
      const blocked = HenreiyaReservationExtra.problem(payload);
      updateSlotHint();
      if (blocked) return blocked;
    }
    if (typeof HenreiyaStore === 'undefined' || !HenreiyaStore.findReservationConflict) return '';
    const conflict = HenreiyaStore.findReservationConflict(payload);
    updateSlotHint();
    return conflict ? conflictMessage(conflict) : '';
  }

  function saveReservation() {
    if (typeof HenreiyaStore === 'undefined') return Promise.resolve();
    return HenreiyaStore.addReservation(Object.assign(reservationPayload(), { status: 'confirmed' }));
  }

  async function validateDateTime() {
    const start = form.querySelector('[name="date_start"]')?.value;
    const end = form.querySelector('[name="date_end"]')?.value;
    if (!start || !end) {
      alert('希望日を選択してください。');
      return false;
    }
    const a = new Date(start);
    const b = new Date(end);
    const diff = Math.round((b - a) / 86400000);
    if (diff < 0) {
      alert('終了日は開始日以降を選択してください。');
      return false;
    }
    if (diff > 1) {
      alert('希望日は1〜2日の範囲で選択してください。');
      return false;
    }
    const timeStart = form.querySelector('[name="time-start"]');
    const timeEnd = form.querySelector('[name="time-end"]');
    if (!timeStart?.value || !timeEnd?.value) {
      alert('ご利用時間を選択してください。');
      return false;
    }
    const reason = await bookingBlockReason();
    if (reason) {
      alert(reason);
      return false;
    }
    return true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (current === 0) return;
    if (current === 1) {
      if (!(await validateDateTime())) {
        showStep(0);
        return;
      }
      if (!form.reportValidity()) return;
      fillConfirm();
      showStep(2);
      return;
    }
    if (current === 2) {
      const btn = form.querySelector('[data-step-panel="2"] button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '送信中…';
      }
      try {
        const reason = await bookingBlockReason();
        if (reason) {
          alert(reason);
          showStep(0);
          return;
        }
        await saveReservation();
        if (window.HenreiyaReservationExtra) {
          const saved = reservationPayload();
          await HenreiyaReservationExtra.addLog({
            type: 'create',
            date: saved.dateStart,
            timeStart: saved.timeStart,
            timeEnd: saved.timeEnd,
            company: saved.company || saved.souka || saved.name,
            actor: 'お客様',
          });
        }
        showStep(3);
      } catch (err) {
        console.warn(err);
        alert('送信できませんでした。時間をおいて再度お試しください。');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'この内容で申し込む';
        }
      }
    }
  });

  fillTimes();
  ['date_start', 'date_end', 'time-start', 'time-end'].forEach((name) => {
    form.querySelector('[name="' + name + '"]')?.addEventListener('change', updateSlotHint);
  });
  refreshReservations().then(updateSlotHint);

  document.getElementById('btn-back')?.addEventListener('click', () => showStep(1));
  document.getElementById('btn-back-pick')?.addEventListener('click', () => showStep(0));
  document.getElementById('btn-to-input')?.addEventListener('click', async () => {
    if (!(await validateDateTime())) return;
    fillConfirm();
    showStep(1);
  });
  document.getElementById('btn-done-home')?.addEventListener('click', () => {
    location.href = 'facility-home.html';
  });

  showStep(0);
})();
