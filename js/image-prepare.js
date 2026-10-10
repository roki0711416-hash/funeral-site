/* 商品画像をスプレッドシートのセル上限に収まるよう圧縮する。縦横比は維持する。 */
window.HenreiyaImage = (function () {
  'use strict';

  const SHEET_CELL = 49000;
  const WRAP_ROOM = 18000;
  const TARGET = SHEET_CELL - WRAP_ROOM;

  function toUrl(canvas, type, quality) {
    try {
      return canvas.toDataURL(type, quality);
    } catch (err) {
      return canvas.toDataURL('image/jpeg', quality);
    }
  }

  function supportsWebp(canvas) {
    const probe = toUrl(canvas, 'image/webp', 0.8);
    return probe.indexOf('data:image/webp') === 0;
  }

  function encode(canvas, limit) {
    const types = supportsWebp(canvas) ? ['image/webp', 'image/jpeg'] : ['image/jpeg'];
    let best = '';
    types.forEach((type) => {
      let lo = 0.42;
      let hi = 0.86;
      let chosen = '';
      for (let i = 0; i < 7; i++) {
        const q = (lo + hi) / 2;
        const url = toUrl(canvas, type, q);
        if (url.length <= limit) {
          chosen = url;
          lo = q + 0.02;
        } else {
          hi = q - 0.02;
        }
      }
      if (!chosen) chosen = toUrl(canvas, type, 0.4);
      if (!best || chosen.length < best.length) best = chosen;
    });
    return best;
  }

  function drawFit(img, maxEdge) {
    const srcW = img.width || img.displayWidth || 1;
    const srcH = img.height || img.displayHeight || 1;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  async function bitmapFrom(file) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (err) {
        try {
          return await createImageBitmap(file);
        } catch (err2) {
          /* fall through */
        }
      }
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image'));
      };
      img.src = url;
    });
  }

  async function prepare(file) {
    const img = await bitmapFrom(file);
    let edge = 720;
    let dataUrl = '';
    while (edge >= 240) {
      const canvas = drawFit(img, edge);
      dataUrl = encode(canvas, TARGET);
      if (dataUrl.length <= TARGET) break;
      edge = Math.round(edge * 0.78);
    }
    if (img.close) img.close();
    if (!dataUrl || dataUrl.length > TARGET) {
      const err = new Error('この画像は保存できない大きさです。別の写真を選んでください。');
      err.code = 'too-large';
      throw err;
    }
    return { display: dataUrl, original: '' };
  }

  return { prepare: prepare, TARGET: TARGET };
})();
