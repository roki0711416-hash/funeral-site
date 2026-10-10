/* Reservation form steps */
(function () {
  'use strict';

  const form = document.getElementById('reserve-form');
  if (!form) return;

  const stepEls = document.querySelectorAll('[data-step-panel]');
  const stepIndicators = document.querySelectorAll('.step');
  const stepLines = document.querySelectorAll('.step-line');
  let current = 1;

  function showStep(n) {
    current = n;
    stepEls.forEach((el) => {
      el.hidden = Number(el.dataset.stepPanel) !== n;
    });
    stepIndicators.forEach((el, i) => {
      const num = i + 1;
      el.classList.toggle('is-active', num === n);
      el.classList.toggle('is-done', num < n);
    });
    stepLines.forEach((el, i) => {
      el.classList.toggle('is-done', i + 1 < n);
    });
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
    return HenreiyaStore.addReservation(reservationPayload());
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (current === 1) {
      const start = form.querySelector('[name="date_start"]')?.value;
      const end = form.querySelector('[name="date_end"]')?.value;
      if (start && end) {
        const a = new Date(start);
        const b = new Date(end);
        const diff = Math.round((b - a) / 86400000);
        if (diff < 0) {
          alert('終了日は開始日以降を選択してください。');
          return;
        }
        if (diff > 1) {
          alert('希望日は1〜2日の範囲で選択してください。');
          return;
        }
      }
      if (!form.reportValidity()) return;
      const reason = await bookingBlockReason();
      if (reason) {
        alert(reason);
        return;
      }
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
          showStep(1);
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
  document.getElementById('btn-done-home')?.addEventListener('click', () => {
    location.href = 'facility-home.html';
  });

  showStep(1);
})();
