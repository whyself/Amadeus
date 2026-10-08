// One CDP stream per visible viewer; no pending frame queue or unlimited buffers.
export async function streamPage(manager, entry, targetId, socket) {
  const page = entry.pages.get(targetId);
  if (!page || page.isClosed()) throw new Error('Page is unavailable.');
  const cdp = await entry.context.newCDPSession(page);
  let disposed = false;
  const pageClosed = () => { socket.close(1000, 'Page closed'); void dispose(); };
  const dispose = async () => {
    if (disposed) return; disposed = true;
    cdp.off('Page.screencastFrame', frame);
    page.off('close', pageClosed);
    await cdp.send('Page.stopScreencast').catch(() => {}); await cdp.detach().catch(() => {});
  };
  const frame = event => {
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    if (disposed || socket.readyState !== 1 || socket.bufferedAmount > 256 * 1024) return;
    socket.send(JSON.stringify({ type: 'frame', browserId: entry.browserId, generation: entry.generation, targetId, viewport: { width: 1280, height: 800 }, metadata: event.metadata, data: event.data }));
  };
  cdp.on('Page.screencastFrame', frame);
  socket.once('close', () => { void dispose(); });
  page.once('close', pageClosed);
  try {
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
    if (socket.readyState !== 1) await dispose();
    return dispose;
  } catch (error) { await dispose(); throw error; }
}
