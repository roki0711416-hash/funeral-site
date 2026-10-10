/* Admin UI helpers */
window.AdminUI = (function () {
  'use strict';

  function sidebarHtml(active) {
    const items = [
      { href: 'index.html', key: 'dashboard', label: 'ダッシュボード' },
      { href: 'reservations.html', key: 'reservations', label: '予約管理' },
      { href: 'products.html', key: 'products', label: '商品管理' },
      { href: 'suppliers.html', key: 'suppliers', label: '仕入れ先' },
      { href: 'orders.html', key: 'orders', label: '注文管理' },
      { href: 'inquiries.html', key: 'inquiries', label: 'お問い合わせ' },
    ];
    return `
      <aside class="admin-sidebar" id="admin-sidebar">
        <div class="admin-brand">
          <strong>株式会社返礼屋</strong>
          <span>ADMIN CONSOLE</span>
        </div>
        <ul class="admin-nav">
          ${items
            .map(
              (i) =>
                `<li><a href="${i.href}" class="${i.key === active ? 'is-active' : ''}">${i.label}</a></li>`
            )
            .join('')}
        </ul>
        <div class="admin-sidebar__foot">
          <div id="admin-user"></div>
          <button type="button" id="admin-logout">ログアウト</button>
          <div style="margin-top:0.75rem;opacity:0.5;"><a href="../index.html" style="color:inherit;">公開サイトへ</a></div>
        </div>
      </aside>
      <div class="admin-overlay" id="admin-overlay"></div>
    `;
  }

  function initShell(active) {
    if (!HenreiyaAuth.requireAuth()) return false;
    HenreiyaStore.ensureSeed();

    const shell = document.getElementById('admin-shell');
    if (shell && !document.getElementById('admin-sidebar')) {
      shell.insertAdjacentHTML('afterbegin', sidebarHtml(active));
    }

    const userEl = document.getElementById('admin-user');
    if (userEl) {
      const sheets = HenreiyaStore.isSheetsEnabled?.()
        ? '｜スプレッドシート連携中'
        : '｜端末内保存（デモ）';
      userEl.textContent = 'ログイン中: ' + HenreiyaAuth.currentUser() + sheets;
    }

    document.getElementById('admin-logout')?.addEventListener('click', () => {
      HenreiyaAuth.logout();
      location.href = 'login.html';
    });

    const toggle = document.getElementById('admin-menu-toggle');
    const sidebar = document.getElementById('admin-sidebar');
    const overlay = document.getElementById('admin-overlay');
    function close() {
      sidebar?.classList.remove('is-open');
      overlay?.classList.remove('is-open');
    }
    toggle?.addEventListener('click', () => {
      sidebar?.classList.toggle('is-open');
      overlay?.classList.toggle('is-open');
    });
    overlay?.addEventListener('click', close);

    return true;
  }

  async function bootstrap(active, options) {
    if (!initShell(active)) return false;
    if (options && options.skipStoreRefresh) return true;
    const tbody = document.querySelector('.admin-table tbody, #dash-reservations, #dash-orders');
    if (tbody && typeof HenreiyaStore.refresh === 'function') {
      try {
        await HenreiyaStore.refresh();
      } catch (e) {
        console.warn(e);
      }
    } else if (typeof HenreiyaStore.refresh === 'function') {
      try {
        await HenreiyaStore.refresh();
      } catch (e) {
        console.warn(e);
      }
    }
    return true;
  }

  function badge(status) {
    return `<span class="badge badge-${status}">${HenreiyaStore.statusLabel(status)}</span>`;
  }

  function statusSelect(current, idAttr) {
    const opts = [
      ['new', '新規'],
      ['awaiting_payment', '入金待ち'],
      ['confirmed', '確認済'],
      ['in_progress', '対応中'],
      ['shipped', '発送済'],
      ['completed', '完了'],
      ['cancelled', 'キャンセル'],
    ];
    return `<select data-status-for="${idAttr}">${opts
      .map(
        ([v, l]) =>
          `<option value="${v}" ${v === current ? 'selected' : ''}>${l}</option>`
      )
      .join('')}</select>`;
  }

  function openModal(html) {
    let backdrop = document.getElementById('admin-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'admin-modal-backdrop';
      backdrop.className = 'admin-modal-backdrop';
      backdrop.innerHTML = '<div class="admin-modal" id="admin-modal"></div>';
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }
    document.getElementById('admin-modal').innerHTML = html;
    backdrop.classList.add('is-open');
  }

  function closeModal() {
    document.getElementById('admin-modal-backdrop')?.classList.remove('is-open');
  }

  return { initShell, bootstrap, badge, statusSelect, openModal, closeModal };
})();
