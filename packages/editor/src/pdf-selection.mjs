function descendant(root, source, depth = 0) {
  if (!root || !source || depth > 12) return false;
  if (root === source) return true;
  try {
    for (let i = 0; i < root.length; i++) if (descendant(root[i], source, depth + 1)) return true;
  } catch { /* A detached or inaccessible frame cannot own this selection. */ }
  return false;
}

function visibleDescendant(root, source) {
  if (root === source) return true;
  try {
    for (const frame of root.document.querySelectorAll('iframe')) {
      if (!descendant(frame.contentWindow, source)) continue;
      const rect = frame.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && root.getComputedStyle(frame).visibility === 'visible' && visibleDescendant(frame.contentWindow, source);
    }
    return false;
  } catch { return descendant(root, source); }
}

function viewerFrames(root, source) {
  if (root === source) return [];
  try {
    for (const frame of root.document.querySelectorAll('iframe')) {
      if (descendant(frame.contentWindow, source)) return [frame, ...viewerFrames(frame.contentWindow, source)];
    }
  } catch { /* Isolated remaining frames fill the containing webview. */ }
  return [];
}

function selectionPosition(frame, source, value, win) {
  const bounds = frame.getBoundingClientRect();
  const rect = value.rect;
  if (!rect || ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return { left: bounds.left + 24, top: bounds.top + bounds.height / 2 };
  let left = rect.left, top = rect.bottom;
  if (Number.isFinite(value.viewport?.width) && Number.isFinite(value.viewport?.height)) {
    left = Math.max(8,Math.min(left,value.viewport.width-170));
    top = Math.max(0,Math.min(top,value.viewport.height-40));
  }
  const path = [frame, ...viewerFrames(frame.contentWindow, source)];
  for (const element of path.reverse()) {
    const box = element.getBoundingClientRect();
    const x = box.width / (element.offsetWidth || box.width), y = box.height / (element.offsetHeight || box.height);
    left = box.left + Math.max(0,Math.min(left + element.clientLeft,element.clientWidth-170)) * x;
    top = box.top + Math.max(0,Math.min(top + element.clientTop,element.clientHeight-40)) * y;
  }
  return { left: Math.max(8, Math.min(left, win.innerWidth - 170)), top: Math.max(8, Math.min(top + 7, win.innerHeight - 40)) };
}

export function installPdfSelectionBridge({ getFrame, resolveSource, onSelection, onClear, win = window }) {
  let revision = 0, disposed = false, owner, observer, observedFrame;
  const watchVisibility = frame => {
    if (observedFrame === frame) return;
    observer?.disconnect(); observedFrame = frame;
    try {
      observer = new win.MutationObserver(() => {
        if (owner && !visibleDescendant(frame.contentWindow, owner)) { revision++; owner = undefined; onClear(); }
      });
      observer.observe(frame.contentDocument, { childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'], subtree: true });
    } catch { /* Source/window validation still applies to isolated documents. */ }
  };
  const receive = async event => {
    if (event.data?.type !== 'amadeus:pdf-selection' || event.origin !== win.location.origin) return;
    const frame = getFrame();
    if (!frame || event.source === frame.contentWindow || !descendant(frame.contentWindow, event.source) || !visibleDescendant(frame.contentWindow, event.source)) return;
    watchVisibility(frame);
    const value = event.data.selection;
    if (value === null) {
      if (owner && owner !== event.source) return;
      revision++; owner = event.source; onClear(); return;
    }
    if (!value || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 50000 || typeof value.fileUri !== 'string' || value.fileUri.length > 8192) return;
    if (![value.pageStart, value.pageEnd, value.pageCount].every(n => Number.isSafeInteger(n) && n > 0) || value.pageEnd < value.pageStart || value.pageEnd > value.pageCount) return;
    const current = ++revision;
    owner = event.source;
    try {
      const { path } = await resolveSource(value.fileUri);
      if (disposed || revision !== current || getFrame() !== frame || !visibleDescendant(frame.contentWindow, event.source)) return;
      if (typeof path !== 'string' || !path) return;
      const position = selectionPosition(frame, event.source, value, win);
      onSelection({ text: value.text.trim(), path, format: 'pdf', pageStart: value.pageStart, pageEnd: value.pageEnd, pageCount: value.pageCount,
        ...position,
        pdfWindow: event.source });
    } catch { if (!disposed && revision === current) onClear(); }
  };
  win.addEventListener('message', receive);
  return { invalidate() { revision++; owner = undefined; }, dispose() { disposed = true; revision++; observer?.disconnect(); win.removeEventListener('message', receive); } };
}
