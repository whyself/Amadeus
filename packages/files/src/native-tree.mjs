// DSH owns rendering and directory subscriptions; these stable DOM hooks only
// provide hosts for Amadeus operations beside native entries.
export function relativeNativePath(root, absolute) {
  if (typeof root !== 'string' || !root || typeof absolute !== 'string') return null;
  const windows = /^[a-z]:[\\/]/i.test(root) || root.startsWith('\\\\') || root.startsWith('//');
  const normalize = value => (windows ? value.replaceAll('\\', '/') : value).replace(/\/$/, '');
  const base = normalize(root), target = normalize(absolute);
  const compare = value => windows ? value.toLowerCase() : value;
  if (compare(base) === compare(target)) return '';
  const prefix = `${base}/`;
  if (!compare(target).startsWith(compare(prefix))) return null;
  const relative = target.slice(prefix.length);
  if (!relative || relative.includes('\0') || relative.split('/').some(part => !part || part === '..' || part === '.')) return null;
  return relative;
}

export function observeNativeFileActions(host, onChange) {
  const owned = new Map();
  let previous = [], disposed = false;
  const scan = () => {
    if (disposed) return;
    const tree = host.querySelector('[data-files-state="tree"][data-files-root]');
    const root = tree?.dataset.filesRoot;
    const candidates = [];
    if (tree?.firstElementChild && root) candidates.push({ owner: tree.firstElementChild, path: '', directory: true });
    for (const row of tree?.querySelectorAll('[data-files-entry][data-files-path]') ?? []) {
      if (!['file', 'directory'].includes(row.dataset.filesEntry)) continue;
      const path = relativeNativePath(root, row.dataset.filesPath);
      if (path) candidates.push({ owner: row, path, directory: row.dataset.filesEntry === 'directory' });
    }
    const active = new Set(candidates.map(item => item.owner));
    for (const [owner, entry] of owned) {
      if (active.has(owner)) continue;
      entry.host.remove(); owner.removeAttribute('data-amadeus-file-row'); owned.delete(owner);
    }
    const entries = candidates.map(item => {
      let entry = owned.get(item.owner);
      if (!entry) {
        const node = host.ownerDocument.createElement('span');
        node.className = item.path ? 'amadeus-native-row-actions' : 'amadeus-native-root-actions';
        entry = { ...item, root, host: node };
        owned.set(item.owner, entry);
      }
      if (item.path) item.owner.setAttribute('data-amadeus-file-row', '');
      if (entry.host.parentElement !== item.owner) item.owner.append(entry.host);
      if (entry.path !== item.path || entry.directory !== item.directory || entry.root !== root) {
        entry = { ...entry, ...item, root }; owned.set(item.owner, entry);
      }
      return entry;
    });
    if (entries.length !== previous.length || entries.some((entry, index) => entry !== previous[index])) {
      previous = entries; onChange(entries);
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-files-root', 'data-files-path', 'data-files-entry'] });
  scan();
  return () => {
    disposed = true; observer.disconnect();
    for (const [owner, entry] of owned) { entry.host.remove(); owner.removeAttribute('data-amadeus-file-row'); }
    owned.clear();
  };
}
