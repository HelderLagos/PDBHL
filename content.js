(() => {
  if (window.__pdlLoaded) return;
  window.__pdlLoaded = true;

  const ICONS = {
    arrow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M6 11l6 6 6-6"/><path d="M5 20h14"/></svg>',
    spinner:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    error:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6"/><path d="M12 17h.01"/></svg>'
  };

  const MIN_MEDIA_SIZE = 70;

  // ---------- UI ----------
  const btn = document.createElement('button');
  btn.id = 'pdl-btn';
  btn.type = 'button';
  btn.title = 'Baixar em qualidade original';
  btn.innerHTML = ICONS.arrow;
  document.documentElement.appendChild(btn);

  const menu = document.createElement('div');
  menu.id = 'pdl-menu';
  document.documentElement.appendChild(menu);

  const toastEl = document.createElement('div');
  toastEl.id = 'pdl-toast';
  document.documentElement.appendChild(toastEl);
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('pdl-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('pdl-show'), 2600);
  }

  let busy = false;
  let menuOpen = false;

  function setState(state) {
    btn.classList.remove('pdl-loading', 'pdl-done', 'pdl-error');
    if (state === 'loading') {
      btn.classList.add('pdl-loading');
      btn.innerHTML = ICONS.spinner;
    } else if (state === 'done') {
      btn.classList.add('pdl-done');
      btn.innerHTML = ICONS.check;
    } else if (state === 'error') {
      btn.classList.add('pdl-error');
      btn.innerHTML = ICONS.error;
    } else {
      btn.innerHTML = ICONS.arrow;
    }
  }

  // ---------- Detecção do pin sob o mouse ----------
  let currentPin = null;
  let lastX = null;
  let lastY = null;
  let scheduled = false;

  function pinIdFrom(href) {
    if (!href) return null;
    const m = href.match(/\/pin\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function biggestMedia(root) {
    let best = null;
    let bestArea = 0;
    root.querySelectorAll('img, video').forEach((el) => {
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    });
    return best;
  }

  function isOurs(el) {
    return el === btn || el === toastEl || el === menu || menu.contains(el);
  }

  function findPinAt(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (isOurs(el) || !el.closest) continue;
      const a = el.closest('a[href*="/pin/"]');
      if (!a) continue;
      const id = pinIdFrom(a.getAttribute('href'));
      if (!id) continue;
      const media = biggestMedia(a);
      if (!media) continue;
      const r = media.getBoundingClientRect();
      if (r.width < MIN_MEDIA_SIZE || r.height < MIN_MEDIA_SIZE) continue;
      return { id, root: a, media };
    }

    // Página do pin aberto: a imagem principal nem sempre fica dentro de um link /pin/
    const pageId = pinIdFrom(location.pathname);
    if (pageId) {
      for (const el of stack) {
        if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') continue;
        const r = el.getBoundingClientRect();
        if (r.width >= 200 && r.height >= 200) {
          return { id: pageId, root: el.parentElement || el, media: el };
        }
      }
    }
    return null;
  }

  function place(pin) {
    const r = pin.media.getBoundingClientRect();
    const top = Math.max(r.top, 0) + 10;
    const left = r.left + 10;
    if (top > r.bottom - 50) {
      hide();
      return;
    }
    btn.style.top = `${top}px`;
    btn.style.left = `${left}px`;
    btn.classList.add('pdl-show');
  }

  function hide() {
    if (busy || menuOpen) return;
    btn.classList.remove('pdl-show');
    currentPin = null;
  }

  function update() {
    scheduled = false;
    if (lastX === null || menuOpen) return;
    const pin = findPinAt(lastX, lastY);
    if (!pin) {
      hide();
      return;
    }
    if (busy && currentPin && currentPin.id !== pin.id) return;
    currentPin = pin;
    place(pin);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      lastX = e.clientX;
      lastY = e.clientY;
      schedule();
    },
    { passive: true }
  );
  window.addEventListener(
    'scroll',
    () => {
      if (menuOpen) closeMenu();
      schedule();
    },
    { passive: true, capture: true }
  );
  document.addEventListener('mouseleave', hide);

  // ---------- Resolução da mídia ----------
  function toSize(url, size) {
    return url.replace(/(pinimg\.com\/)[^/]+\//, `$1${size}/`);
  }

  function swapExt(url, ext) {
    return url.replace(/\.(jpe?g|png|gif|webp)(?=($|\?))/i, `.${ext}`);
  }

  function thumbOf(url) {
    if (!url) return '';
    return /pinimg\.com\//.test(url) ? swapExt(toSize(url, '236x'), 'jpg') : url;
  }

  // O Pinterest mostra GIFs como JPG nas miniaturas (inclusive nos slides de carrossel).
  // Por isso a primeira tentativa é sempre a versão .gif original; se ela não existir, o servidor responde 404
  // e a extensão passa para o formato estático.
  function imageItem(url, thumb) {
    const isGif = /\.gif(\?|$)/i.test(url);
    const t = thumb || thumbOf(url);
    if (!/pinimg\.com\//.test(url)) return { kind: isGif ? 'gif' : 'image', candidates: [url], thumb: t };
    const orig = toSize(url, 'originals');
    const candidates = isGif
      ? [orig]
      : [swapExt(orig, 'gif'), orig, swapExt(orig, 'png'), swapExt(orig, 'jpg'), swapExt(orig, 'webp')];
    candidates.push(toSize(url, '736x'), url);
    return { kind: isGif ? 'gif' : 'image', candidates, thumb: t };
  }

  function bestImage(images) {
    if (!images || typeof images !== 'object') return null;
    if (images.orig && images.orig.url) return images.orig.url;
    let best = null;
    for (const v of Object.values(images)) {
      if (v && v.url && (!best || (v.width || 0) > (best.width || 0))) best = v;
    }
    return best ? best.url : null;
  }

  function hlsToMp4(url) {
    if (!/\.m3u8/i.test(url)) return [url];
    const base = url.replace('/hls/', '/720p/').replace(/\.m3u8.*/i, '.mp4');
    const noWidth = base.replace(/_\d+w(?=\.mp4)/, '');
    return [...new Set([noWidth, base])];
  }

  function pickVideo(list, thumb) {
    if (!list || typeof list !== 'object') return null;
    const entries = Object.values(list).filter((v) => v && v.url);
    if (!entries.length) return null;
    const mp4 = entries
      .filter((v) => /\.mp4(\?|$)/i.test(v.url))
      .sort((a, b) => (b.width || 0) - (a.width || 0))
      .map((v) => v.url);
    const hls = entries.filter((v) => /\.m3u8/i.test(v.url)).flatMap((v) => hlsToMp4(v.url));
    const candidates = [...new Set([...mp4, ...hls])];
    const poster = thumb || (entries.find((v) => v.thumbnail) || {}).thumbnail || '';
    return candidates.length ? { kind: 'video', candidates, thumb: poster } : null;
  }

  function mediaFromPinData(d) {
    if (!d) return [];
    const out = [];
    const cover = thumbOf(bestImage(d.images));

    const video = pickVideo(d.videos && d.videos.video_list, cover);
    if (video) return [video];

    const pages = d.story_pin_data && d.story_pin_data.pages;
    if (Array.isArray(pages) && pages.length) {
      for (const page of pages) {
        for (const block of page.blocks || []) {
          const imgUrl = bestImage(block.image && block.image.images);
          const v = pickVideo(block.video && block.video.video_list, thumbOf(imgUrl));
          if (v) {
            out.push(v);
            continue;
          }
          if (imgUrl) out.push(imageItem(imgUrl));
        }
      }
      if (out.length) return out;
    }

    const slots = d.carousel_data && d.carousel_data.carousel_slots;
    if (Array.isArray(slots) && slots.length > 1) {
      for (const s of slots) {
        const u = bestImage(s.images);
        // Slides animados do carrossel vêm como vídeo (MP4) no campo "videos" do slide
        const v = pickVideo(s.videos && s.videos.video_list, thumbOf(u));
        if (v) {
          out.push(v);
          continue;
        }
        if (u) out.push(imageItem(u));
      }
      if (out.length) return out;
    }

    if (d.embed && d.embed.type === 'gif' && d.embed.src) {
      return [{ kind: 'gif', candidates: [d.embed.src], thumb: cover }];
    }

    const u = bestImage(d.images);
    if (u) out.push(imageItem(u));
    return out;
  }

  async function fetchPinData(id) {
    const data = { options: { id, field_set_key: 'detailed' }, context: {} };
    const url =
      `${location.origin}/resource/PinResource/get/` +
      `?source_url=${encodeURIComponent(`/pin/${id}/`)}` +
      `&data=${encodeURIComponent(JSON.stringify(data))}` +
      `&_=${Date.now()}`;
    const r = await fetch(url, {
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Pinterest-PWS-Handler': 'www/pin/[id].js'
      }
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const j = await r.json();
    return j && j.resource_response && j.resource_response.data;
  }

  function largestFromImg(img) {
    if (!img) return null;
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      let best = null;
      let bestVal = 0;
      srcset.split(',').forEach((part) => {
        const [u, d] = part.trim().split(/\s+/);
        const val = parseFloat(d) || 1;
        if (u && val >= bestVal) {
          bestVal = val;
          best = u;
        }
      });
      if (best) return best;
    }
    return img.currentSrc || img.src || null;
  }

  function mediaFromDom(pin) {
    const root = pin.root;
    const video = root.tagName === 'VIDEO' ? root : root.querySelector('video');
    if (video) {
      const src = video.currentSrc || video.src || (video.querySelector('source') || {}).src;
      if (src && !src.startsWith('blob:')) return [{ kind: 'video', candidates: hlsToMp4(src), thumb: video.poster || '' }];
    }
    const img = pin.media && pin.media.tagName === 'IMG' ? pin.media : root.querySelector('img');
    const u = largestFromImg(img);
    return u ? [imageItem(u)] : [];
  }

  function slug(text) {
    if (!text) return '';
    return String(text)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  async function collect(pin) {
    let items = [];
    let title = '';
    try {
      const d = await fetchPinData(pin.id);
      items = mediaFromPinData(d);
      title = (d && (d.title || d.grid_title)) || '';
    } catch (err) {
      console.warn('[PDBHL] API indisponível, usando a página:', err);
    }
    if (!items.length) items = mediaFromDom(pin);
    return { items, title };
  }

  async function send(msg) {
    const res = await chrome.runtime.sendMessage(msg);
    if (!res || !res.ok) throw new Error((res && res.error) || 'Falha na extensão');
    return res;
  }

  // ---------- Menu de carrossel ----------
  let menuData = null;

  function closeMenu() {
    menuOpen = false;
    menuData = null;
    menu.classList.remove('pdl-show');
    menu.innerHTML = '';
  }

  function openMenu(data) {
    menuData = data;
    const { resolved } = data;
    menu.innerHTML = '';

    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'pdl-all';
    all.innerHTML = `${ICONS.arrow}<span>Baixar todos (${resolved.length})</span>`;
    all.addEventListener('click', (e) => {
      e.stopPropagation();
      download(resolved.map((_, i) => i));
    });
    menu.appendChild(all);

    const list = document.createElement('div');
    list.className = 'pdl-list';
    resolved.forEach((item, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'pdl-item';
      const thumb = document.createElement('img');
      thumb.alt = '';
      thumb.referrerPolicy = 'no-referrer';
      if (item.thumb) thumb.src = item.thumb;
      const name = document.createElement('span');
      name.textContent = `Slide ${i + 1}`;
      const tag = document.createElement('em');
      tag.textContent = item.ext.toUpperCase();
      if (item.kind === 'gif') tag.className = 'pdl-gif';
      if (item.kind === 'video') tag.className = 'pdl-video';
      row.append(thumb, name, tag);
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        download([i]);
      });
      list.appendChild(row);
    });
    menu.appendChild(list);

    const b = btn.getBoundingClientRect();
    menu.classList.add('pdl-show');
    menuOpen = true;
    const m = menu.getBoundingClientRect();
    let top = b.bottom + 8;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, b.top - m.height - 8);
    let left = b.left;
    if (left + m.width > window.innerWidth - 8) left = window.innerWidth - m.width - 8;
    menu.style.top = `${top}px`;
    menu.style.left = `${Math.max(8, left)}px`;
  }

  async function download(indexes) {
    if (!menuData) return;
    const { resolved, baseName } = menuData;
    closeMenu();
    busy = true;
    setState('loading');
    try {
      const res = await send({
        type: 'pdl-download',
        baseName,
        total: resolved.length,
        items: indexes.map((i) => ({ ...resolved[i], index: i }))
      });
      setState('done');
      toast(res.count > 1 ? `${res.count} arquivos baixados` : 'Download iniciado');
    } catch (err) {
      fail(err);
    } finally {
      finish();
    }
  }

  function fail(err) {
    console.warn('[PDBHL]', err);
    setState('error');
    const msg = /Extension context invalidated/i.test(String(err))
      ? 'Extensão atualizada. Recarregue a página.'
      : err.message || 'Não deu pra baixar';
    toast(msg);
  }

  function finish() {
    setTimeout(() => {
      busy = false;
      setState('idle');
      schedule();
    }, 1400);
  }

  // ---------- Clique ----------
  [btn, menu].forEach((el) =>
    ['pointerdown', 'mousedown', 'mouseup', 'touchstart'].forEach((type) =>
      el.addEventListener(type, (e) => {
        if (el === btn) e.preventDefault();
        e.stopPropagation();
      })
    )
  );

  document.addEventListener(
    'mousedown',
    (e) => {
      if (menuOpen && !isOurs(e.target)) closeMenu();
    },
    true
  );
  document.addEventListener('keydown', (e) => {
    if (menuOpen && e.key === 'Escape') closeMenu();
  });

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) {
      closeMenu();
      return;
    }
    const pin = currentPin;
    if (!pin || busy) return;
    busy = true;
    setState('loading');
    let keepBusy = false;
    try {
      const { items, title } = await collect(pin);
      if (!items.length) throw new Error('Não encontrei mídia nesse pin');
      const baseName = [slug(title), pin.id].filter(Boolean).join('_');
      const { resolved } = await send({ type: 'pdl-resolve', items });
      if (!resolved.length) throw new Error('Não consegui acessar o arquivo');

      if (resolved.length === 1) {
        const res = await send({ type: 'pdl-download', baseName, total: 1, items: [{ ...resolved[0], index: 0 }] });
        setState('done');
        toast(res.count > 1 ? `${res.count} arquivos baixados` : 'Download iniciado');
      } else {
        busy = false;
        keepBusy = true;
        setState('idle');
        openMenu({ resolved, baseName });
      }
    } catch (err) {
      fail(err);
    } finally {
      if (!keepBusy) finish();
    }
  });
})();
