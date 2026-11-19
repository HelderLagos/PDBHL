const DEFAULTS = { folder: 'Pinterest', saveAs: false };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;
  let job = null;
  if (msg.type === 'pdl-resolve') job = resolveAll(msg.items);
  if (msg.type === 'pdl-download') job = handleDownload(msg);
  if (!job) return false;
  job
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
  return true;
});

function cleanFolder(folder) {
  const parts = String(folder || '')
    .split(/[\\/]+/)
    .map((p) => p.replace(/[<>:"|?*\x00-\x1f]/g, '').trim())
    .filter((p) => p && p !== '.' && p !== '..');
  return parts.length ? parts.join('/') : DEFAULTS.folder;
}

function extFrom(url, kind) {
  const m = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  return kind === 'video' ? 'mp4' : kind === 'gif' ? 'gif' : 'jpg';
}

function kindFrom(ext, fallback) {
  if (ext === 'gif') return 'gif';
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'video';
  if (['jpg', 'png', 'webp'].includes(ext)) return 'image';
  return fallback || 'image';
}

async function firstWorking(candidates) {
  const list = [...new Set((candidates || []).filter(Boolean))];
  for (const url of list) {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (r.ok) return url;
    } catch (_) {
      // tenta o próximo
    }
  }
  return list[list.length - 1] || null;
}

async function resolveAll(items) {
  const results = await Promise.all(
    (items || []).map(async (item) => {
      const url = await firstWorking(item.candidates);
      if (!url) return null;
      const ext = extFrom(url, item.kind);
      return { url, ext, kind: kindFrom(ext, item.kind), thumb: item.thumb || '' };
    })
  );
  return { ok: true, resolved: results.filter(Boolean) };
}

async function handleDownload({ baseName, items, total }) {
  const { folder, saveAs } = await chrome.storage.sync.get(DEFAULTS);
  const dir = cleanFolder(folder);
  const name = (baseName || 'pin').replace(/[^a-z0-9_-]/gi, '') || 'pin';
  const many = (total || items.length) > 1;
  let count = 0;

  for (const item of items) {
    if (!item || !item.url) continue;
    const suffix = many ? `-${String((item.index || 0) + 1).padStart(2, '0')}` : '';
    const filename = `${dir}/${name}${suffix}.${item.ext || extFrom(item.url, item.kind)}`;
    await chrome.downloads.download({
      url: item.url,
      filename,
      conflictAction: 'uniquify',
      saveAs: Boolean(saveAs) && items.length === 1
    });
    count++;
  }

  if (!count) throw new Error('Não consegui acessar o arquivo');
  return { ok: true, count };
}
