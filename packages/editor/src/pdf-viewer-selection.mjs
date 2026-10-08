// Installed as an ES module beside LaTeX Workshop's viewer entry point.
export function installPdfViewerSelection({ win = window, getFileUri }) {
  if (win.top === win) return () => {};
  const doc = win.document;
  let timer, selecting = false, previous = '';
  function publish() {
    clearTimeout(timer);
    const selection = win.getSelection();
    let value = null;
    if (selection?.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const pageOf = node => (node.nodeType === 1 ? node : node.parentElement)?.closest('.textLayer')?.closest('.page[data-page-number]');
      const start = pageOf(range.startContainer), end = pageOf(range.endContainer);
      const text = selection.toString().trim();
      if (start && end && text && text.length <= 50000) {
        const caret = doc.createRange();caret.setStart(selection.focusNode,selection.focusOffset);caret.collapse(true);
        const focus = caret.getBoundingClientRect();
        const visible = [...range.getClientRects()].filter(rect => rect.height && rect.bottom >= 0 && rect.top <= win.innerHeight);
        const backwards = selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset;
        const rect = focus.height && focus.bottom >= 0 && focus.top <= win.innerHeight ? focus : (backwards ? visible[0] : visible.at(-1)) ?? range.getBoundingClientRect();
        try {
          value = { fileUri: getFileUri(), text, pageStart: Number(start.dataset.pageNumber), pageEnd: Number(end.dataset.pageNumber),
            pageCount: win.PDFViewerApplication?.pagesCount || doc.querySelectorAll('.page[data-page-number]').length,
            viewport: { width: win.innerWidth, height: win.innerHeight },
            rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } };
        } catch { /* Viewer may be between documents. */ }
      }
    }
    const serialized = JSON.stringify(value);
    if (serialized === previous) return;
    previous = serialized;
    win.top.postMessage({ type: 'amadeus:pdf-selection', selection: value }, win.location.origin);
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { if (!selecting) publish(); }, 140); };
  const down = () => { selecting = true; };
  const finish = () => { selecting = false; publish(); };
  const hide = () => { previous = ''; win.top.postMessage({ type: 'amadeus:pdf-selection', selection: null }, win.location.origin); };
  const clear = event => {
    if (event.source !== win.top || event.origin !== win.location.origin || event.data?.type !== 'amadeus:pdf-selection-clear') return;
    win.getSelection()?.removeAllRanges(); publish();
  };
  const events = [['pointerdown', down], ['pointerup', finish], ['pointercancel', finish], ['touchstart', down], ['touchend', finish], ['touchcancel', finish], ['mouseup', finish], ['keyup', publish], ['selectionchange', schedule], ['scroll', schedule]];
  for (const [name, handler] of events) doc.addEventListener(name, handler, { capture: true, passive: true });
  win.addEventListener('pagehide', hide);
  win.addEventListener('message', clear);
  const refocus = () => { previous = ''; publish(); };
  win.addEventListener('focus', refocus);
  return () => {
    clearTimeout(timer);
    for (const [name, handler] of events) doc.removeEventListener(name, handler, true);
    win.removeEventListener('pagehide', hide); win.removeEventListener('message', clear); win.removeEventListener('focus', refocus); hide();
  };
}
