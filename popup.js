const DEFAULTS = { folder: 'Pinterest', saveAs: false };
const folderEl = document.getElementById('folder');
const saveAsEl = document.getElementById('saveAs');
const statusEl = document.getElementById('status');

chrome.storage.sync.get(DEFAULTS).then(({ folder, saveAs }) => {
  folderEl.value = folder;
  saveAsEl.checked = saveAs;
});

let t = null;
function save() {
  chrome.storage.sync
    .set({ folder: folderEl.value.trim() || DEFAULTS.folder, saveAs: saveAsEl.checked })
    .then(() => {
      statusEl.textContent = 'Salvo';
      clearTimeout(t);
      t = setTimeout(() => (statusEl.textContent = ''), 1200);
    });
}

folderEl.addEventListener('input', () => {
  clearTimeout(t);
  t = setTimeout(save, 400);
});
saveAsEl.addEventListener('change', save);
