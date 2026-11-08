/* 管理画面の一括写真登録。保存は既存の saveProduct に任せ、ここは振り分けと検証だけを行う。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HenreiyaPhotoImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SKU = /^[A-Za-z][A-Za-z0-9]*-\d{2,}$/;
  const EXT = /\.(jpe?g|png|webp)$/i;

  function baseName(name) {
    return String(name || '').split(/[/\\]/).pop();
  }

  function parsePhotoName(name) {
    const base = baseName(name);
    const ext = base.match(/(\.[^.]+)$/);
    if (!ext || !EXT.test(ext[1])) return { kind: 'ignore', reason: '画像ファイルではない' };
    const stem = base.slice(0, -ext[1].length);
    const glued = stem.match(/^([A-Za-z][A-Za-z0-9]*-\d{2,})[a-zA-Z]+(?:_\d{2}[a-zA-Z]*)?$/);
    const splitLetter = stem.match(/^([A-Za-z][A-Za-z0-9]*-\d{2,})[-_][aAbB](?:_\d{2})?$/);
    const orderLetter = stem.match(/^([A-Za-z][A-Za-z0-9]*-\d{2,})_(\d{2})[a-zA-Z]+$/);
    if (glued || splitLetter || orderLetter) {
      const sku = (glued || splitLetter || orderLetter)[1];
      return { kind: 'ambiguous', sku: sku, reason: 'a/b などあいまいなファイル名' };
    }
    const numbered = stem.match(/^(.*)_(\d{2})$/);
    if (!numbered) return { kind: 'ignore', reason: '申込番号_01 の形式ではない' };
    const sku = numbered[1];
    const order = Number(numbered[2]);
    if (!SKU.test(sku)) return { kind: 'ignore', reason: '申込番号の形式ではない' };
    if (!Number.isInteger(order) || order < 1 || order > 10) {
      return { kind: 'overlimit', sku: sku, order: order, reason: '01から10以外の番号' };
    }
    return { kind: 'ok', sku: sku, order: order };
  }

  function uniqueProducts(list) {
    const out = [];
    (list || []).forEach((product) => {
      if (!product || out.some((item) => String(item.id) === String(product.id))) return;
      out.push(product);
    });
    return out;
  }

  function matchProduct(products, sku) {
    const key = String(sku || '');
    const hits = uniqueProducts(products).filter((product) => {
      const id = String(product.id || '');
      const applicationNo = String(product.applicationNo || '').trim();
      return id === key || applicationNo === key || id.toLowerCase() === key.toLowerCase() || applicationNo.toLowerCase() === key.toLowerCase();
    });
    return hits;
  }

  function sameFileSet(left, right) {
    const a = (left || []).slice().sort((x, y) => x.order - y.order);
    const b = (right || []).slice().sort((x, y) => x.order - y.order);
    if (a.length !== b.length || !a.length) return false;
    return a.every((file, index) => {
      return file.order === b[index].order && file.sha256 && file.sha256 === b[index].sha256;
    });
  }

  function priorOf(ledger, sku) {
    const products = ledger && Array.isArray(ledger.products) ? ledger.products : [];
    return products.find((item) => item && String(item.sku) === String(sku)) || null;
  }

  function planPhotoImport(input) {
    const files = (input && input.files) || [];
    const products = (input && input.products) || [];
    const ledger = input && input.ledger;
    const groups = new Map();
    const ignored = [];
    files.forEach((file) => {
      const parsed = parsePhotoName(file.name);
      if (parsed.kind === 'ignore') {
        ignored.push({ name: baseName(file.name), reason: parsed.reason });
        return;
      }
      const sku = parsed.sku;
      if (!groups.has(sku)) groups.set(sku, []);
      groups.get(sku).push({ file: file, parsed: parsed });
    });
    const jobs = [];
    Array.from(groups.keys()).sort().forEach((sku) => {
      const rows = groups.get(sku);
      const ambiguous = rows.find((row) => row.parsed.kind === 'ambiguous');
      const over = rows.find((row) => row.parsed.kind === 'overlimit');
      const ok = rows.filter((row) => row.parsed.kind === 'ok');
      const listed = ok
        .map((row) => ({
          order: row.parsed.order,
          name: baseName(row.file.name),
          sha256: String(row.file.sha256 || ''),
          file: row.file.file || null,
        }))
        .sort((a, b) => a.order - b.order);
      if (ambiguous || over || ok.length > 10) {
        jobs.push({
          sku: sku,
          action: ambiguous ? 'skip-ambiguous' : 'skip-overlimit',
          status: ambiguous ? 'skip-ambiguous' : 'skip-overlimit',
          reason: ambiguous ? ambiguous.parsed.reason : '11枚以上、または01から10以外の番号',
          files: listed,
          product: null,
        });
        return;
      }
      const orders = listed.map((file) => file.order);
      if (new Set(orders).size !== orders.length) {
        jobs.push({ sku: sku, action: 'skip-overlimit', status: 'skip-overlimit', reason: '同じ番号が重複', files: listed, product: null });
        return;
      }
      if (!orders.includes(1)) {
        jobs.push({ sku: sku, action: 'skip-no-main', status: 'skip-no-main', reason: '01 がないためメインを決められない', files: listed, product: null });
        return;
      }
      const hits = matchProduct(products, sku);
      if (hits.length !== 1) {
        jobs.push({
          sku: sku,
          action: hits.length ? 'skip-multi' : 'skip-unmatched',
          status: hits.length ? 'skip-multi' : 'skip-unmatched',
          reason: hits.length ? '同じ申込番号の商品が複数ある' : '一致する商品がない',
          files: listed,
          product: null,
        });
        return;
      }
      const prior = priorOf(ledger, sku);
      let action = 'run';
      let reason = '';
      if (prior && prior.status === 'saved') {
        if (sameFileSet(prior.files, listed)) {
          action = 'skip-done';
          reason = '同じファイルは登録済み';
        } else {
          action = 'skip-changed';
          reason = '台帳のファイルと違うため、自動では上書きしない';
        }
      }
      jobs.push({
        sku: sku,
        id: hits[0].id,
        action: action,
        status: action,
        reason: reason,
        files: listed,
        product: hits[0],
      });
    });
    return {
      ready: jobs.some((job) => job.action === 'run'),
      jobs: jobs,
      ignored: ignored,
    };
  }

  function photoOnlyPayload(product, images) {
    const next = Object.assign({}, product);
    delete next.galleryOnly;
    delete next.imageOriginal;
    next.image = images[0] || '';
    next.images = images.slice();
    return next;
  }

  function confirmedGallery(product) {
    const list = [];
    const push = (src) => {
      const value = String(src || '').trim();
      if (!value || list.indexOf(value) !== -1 || list.length >= 10) return;
      list.push(value);
    };
    if (product) push(product.image);
    if (product && Array.isArray(product.images)) product.images.forEach(push);
    return list;
  }

  function galleryOk(sent, product) {
    const got = confirmedGallery(product);
    if (!sent || got.length !== sent.length) return false;
    return sent.every((src, index) => got[index] === src);
  }

  function nonPhotoIntact(before, after) {
    const fields = ['id', 'name', 'applicationNo', 'categoryId', 'category', 'published', 'price'];
    for (let i = 0; i < fields.length; i += 1) {
      const key = fields[i];
      let same = false;
      if (key === 'price') same = Number(before && before.price) === Number(after && after.price);
      else if (key === 'published') same = (before && before.published !== false) === (after && after.published !== false);
      else same = String((before && before[key]) || '') === String((after && after[key]) || '');
      if (!same) return { ok: false, reason: '写真以外の「' + key + '」が保存後に変わっています。ここで止めました。' };
    }
    return { ok: true, reason: '' };
  }

  async function executePhotoPlan(options) {
    const jobs = (options.jobs || []).slice();
    const saveProduct = options.saveProduct;
    const prepare = options.prepare || (async (job) => job.images || []);
    const out = [];
    let stopped = false;
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      if (stopped) {
        out.push(job.action === 'run'
          ? Object.assign({}, job, { action: 'pending', status: 'pending', reason: '手前で止めたため未保存' })
          : job);
        continue;
      }
      if (job.action !== 'run') {
        out.push(job);
        continue;
      }
      try {
        const images = await prepare(job);
        if (!images || images.length !== job.files.length || !images.length) {
          throw new Error('写真を整えられませんでした。');
        }
        const saved = await saveProduct(photoOnlyPayload(job.product, images));
        if (!galleryOk(images, saved)) {
          throw new Error('写真の順番は保存されていません。再読み込みしても、選んだメイン画像のままではありません。');
        }
        const fields = nonPhotoIntact(job.product, saved);
        if (!fields.ok) throw new Error(fields.reason);
        out.push(Object.assign({}, job, { action: 'saved', status: 'saved', reason: '' }));
      } catch (err) {
        stopped = true;
        out.push(Object.assign({}, job, {
          action: 'failed',
          status: 'failed',
          reason: (err && err.message) || String(err),
        }));
      }
    }
    return { jobs: out, stopped: stopped };
  }

  function ledgerFromResults(jobs) {
    return {
      version: 1,
      products: (jobs || []).map((job) => ({
        sku: job.sku,
        id: (job.product && job.product.id) || job.id || '',
        status: job.status || job.action,
        reason: job.reason || '',
        files: (job.files || []).map((file) => ({
          order: file.order,
          name: file.name,
          sha256: file.sha256,
        })),
      })),
    };
  }

  return {
    parsePhotoName: parsePhotoName,
    planPhotoImport: planPhotoImport,
    photoOnlyPayload: photoOnlyPayload,
    nonPhotoIntact: nonPhotoIntact,
    galleryOk: galleryOk,
    executePhotoPlan: executePhotoPlan,
    ledgerFromResults: ledgerFromResults,
    sameFileSet: sameFileSet,
  };
});
