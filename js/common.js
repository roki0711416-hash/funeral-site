/* Shared utilities */
(function () {
  'use strict';

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
})();
