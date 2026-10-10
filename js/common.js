/* Shared utilities */
(function () {
  'use strict';

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  function scrollToHashOrTop() {
    if (location.hash) {
      const id = decodeURIComponent(location.hash.replace(/^#/, ''));
      const target = id ? document.getElementById(id) : null;
      if (target) {
        window.setTimeout(() => target.scrollIntoView(), 0);
        return;
      }
    }
    window.scrollTo(0, 0);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scrollToHashOrTop);
  } else {
    scrollToHashOrTop();
  }

  /* Mobile nav */
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  const overlay = document.querySelector('.nav-overlay');
  const closeBtn = document.querySelector('.nav-drawer-close');

  function openNav() {
    nav?.classList.add('is-open');
    overlay?.classList.add('is-open');
    toggle?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeNav() {
    nav?.classList.remove('is-open');
    overlay?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  toggle?.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') closeNav();
    else openNav();
  });
  closeBtn?.addEventListener('click', closeNav);
  overlay?.addEventListener('click', closeNav);

  nav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeNav));

  /* Scroll reveal */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  /* FAQ accordion */
  document.querySelectorAll('.faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const open = item.classList.contains('is-open');
      item.parentElement.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('is-open'));
      if (!open) item.classList.add('is-open');
    });
  });

  /* Current year */
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  /* Cookie consent */
  const COOKIE_KEY = 'henreiya_cookie_consent';
  const LINE_URL = 'https://line.me/R/ti/p/@013nkarr';
  const isAdmin = location.pathname.includes('/admin/');

  if (!isAdmin && !document.querySelector('.line-float')) {
    const lineBtn = document.createElement('a');
    lineBtn.href = LINE_URL;
    lineBtn.target = '_blank';
    lineBtn.rel = 'noopener noreferrer';
    lineBtn.className = 'line-float';
    lineBtn.setAttribute('aria-label', '公式LINEを友だち追加');
    lineBtn.title = '公式LINE';
    lineBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.286.629-.631.629-.345 0-.63-.285-.63-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049 1.186 1.434 0 7.998-4.503 10.843-7.69C23.176 15.275 24 12.97 24 10.314"/>
      </svg>
    `;
    document.body.appendChild(lineBtn);
  }

  if (!localStorage.getItem(COOKIE_KEY) && !isAdmin) {
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookieの利用について');
    banner.innerHTML = `
      <div class="cookie-banner__inner">
        <p class="cookie-banner__text">
          当サイトでは、利便性向上のためCookieを使用する場合があります。
          詳細は<a href="cookies.html">クッキーポリシー</a>をご確認ください。
        </p>
        <div class="cookie-banner__actions">
          <button type="button" class="btn btn-primary" data-cookie-accept>同意する</button>
          <a href="cookies.html" class="btn btn-secondary">詳細を見る</a>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
    document.body.classList.add('has-cookie-banner');
    requestAnimationFrame(() => banner.classList.add('is-visible'));
    banner.querySelector('[data-cookie-accept]')?.addEventListener('click', () => {
      localStorage.setItem(COOKIE_KEY, 'accepted');
      banner.classList.remove('is-visible');
      document.body.classList.remove('has-cookie-banner');
      setTimeout(() => banner.remove(), 400);
    });
  }

  const VIEW_KEY = 'henreiya_view_mode';
  const viewport = document.querySelector('meta[name="viewport"]');
  const viewportDefault =
    (viewport && viewport.getAttribute('content')) || 'width=device-width, initial-scale=1';

  function viewMode() {
    const value = localStorage.getItem(VIEW_KEY) || 'auto';
    return value === 'pc' || value === 'sp' ? value : 'auto';
  }

  function applyView(mode) {
    const next = mode === 'pc' || mode === 'sp' ? mode : 'auto';
    document.documentElement.setAttribute('data-view', next);
    if (!viewport) return;
    if (next === 'pc') {
      const scale = Math.min(1, window.innerWidth / 1180);
      viewport.setAttribute(
        'content',
        'width=1180, initial-scale=' + String(Math.max(0.25, Number(scale.toFixed(3))))
      );
    } else if (next === 'sp') {
      viewport.setAttribute('content', 'width=390, initial-scale=1');
    } else {
      viewport.setAttribute('content', viewportDefault);
    }
    document.querySelectorAll('.view-switch [data-view]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-view') === next);
    });
  }

  if (!isAdmin) {
    const inner = document.querySelector('.header-inner');
    const menuBtn = document.querySelector('.menu-toggle');
    if (inner && !inner.querySelector('.view-switch')) {
      const box = document.createElement('div');
      box.className = 'view-switch';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', '表示切替');
      [
        ['auto', '自動'],
        ['pc', 'PC表示'],
        ['sp', 'スマートフォン表示'],
      ].forEach((pair) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-view', pair[0]);
        btn.textContent = pair[1];
        btn.addEventListener('click', () => {
          localStorage.setItem(VIEW_KEY, pair[0]);
          applyView(pair[0]);
        });
        box.appendChild(btn);
      });
      if (menuBtn) inner.insertBefore(box, menuBtn);
      else inner.appendChild(box);
    }
    applyView(viewMode());
    window.addEventListener('resize', () => {
      if (viewMode() === 'pc') applyView('pc');
    });
  }

  document.querySelectorAll('img:not([loading])').forEach((img) => {
    if (img.closest('.hero, .portal-hero')) return;
    img.loading = 'lazy';
    img.decoding = 'async';
  });
})();
