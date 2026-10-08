import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { tr, setAmadeusLocale, useAmadeusLocale } from '../../reader/src/locale.mjs';
import { shouldRevealBrowser } from './client-state.mjs';
import styles from './browser.css';

export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs', 'locale'];
const id = 'dsh-amadeus-browser', kind = 'amadeus-ai-browser';
const states = new Map(), listeners = new Set();
let transportGeneration = 0;
function publish(state) {
  const previous = states.get(state.sessionId);
  if (previous && (previous.generation > state.generation || (previous.browserId === state.browserId && previous.revision > state.revision))) return false;
  states.set(state.sessionId, state); for (const notify of listeners) notify();
  return true;
}
const subscribe = notify => { listeners.add(notify); return () => listeners.delete(notify); };
function BrowserTitle() { useAmadeusLocale(); return tr('AI 浏览器', 'AI Browser'); }

export function BrowserTab({ sessionId, useTabInfo }) {
  useAmadeusLocale();
  const { tab } = useTabInfo();
  const state = useSyncExternalStore(subscribe, () => states.get(sessionId));
  const [error, setError] = useState(''), [connected, setConnected] = useState(false), [retrying, setRetrying] = useState(false);
  const canvas = useRef();
  const page = state?.pages.find(page => page.targetId === state.selectedTargetId);
  const visible = tab.visible !== false;
  useEffect(() => {
    let alive = true; const generation = transportGeneration;
    fetch(`/amadeus/browser/state?session=${encodeURIComponent(sessionId)}`).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (alive && generation === transportGeneration) publish(body); }).catch(error => { if (alive) setError(error.message); });
    return () => { alive = false; };
  }, [sessionId]);
  useEffect(() => {
    setConnected(false);
    if (!visible || !state?.selectedTargetId || state.failed || !canvas.current) return;
    const query = new URLSearchParams({ session: sessionId, browserId: state.browserId, generation: state.generation, target: state.selectedTargetId });
    let active = true, timer, ws, sequence = 0;
    const connect = () => {
      if (!active) return;
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/amadeus/browser/stream?${query}`);
      ws.onmessage = event => {
        if (!active) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'error') { setError(message.error); return; }
          if (message.type !== 'frame' || message.generation !== state.generation || message.targetId !== state.selectedTargetId) return;
          const number = ++sequence, picture = new Image();
          picture.onload = () => {
            if (!active || number !== sequence || !canvas.current) return;
            canvas.current.width = picture.naturalWidth; canvas.current.height = picture.naturalHeight;
            canvas.current.getContext('2d').drawImage(picture, 0, 0); setConnected(true); setError('');
          };
          picture.src = `data:image/jpeg;base64,${message.data}`;
        } catch { setError(tr('浏览器画面数据无效', 'Invalid browser frame')); }
      };
      ws.onclose = () => { if (active) { setConnected(false); timer = setTimeout(connect, 1500); } };
    };
    connect(); return () => { active = false; clearTimeout(timer); ws?.close(); };
  }, [sessionId, state?.browserId, state?.generation, state?.selectedTargetId, state?.failed, visible]);
  async function retry() {
    setRetrying(true); setError('');
    try {
      const response = await fetch(`/amadeus/browser/command?session=${encodeURIComponent(sessionId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry', browserId: state.browserId, generation: state.generation }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error); publish(body);
    } catch (error) { setError(error.message); } finally { setRetrying(false); }
  }
  return <section className="amadeus-browser" data-amadeus-browser>
    <div className="amadeus-browser-toolbar"><input aria-label={tr('AI 浏览器地址', 'AI browser address')} readOnly value={page?.url || ''} placeholder={tr('等待 AI 打开网页', 'Waiting for AI to open a page')} /><span>{tr('只读', 'Read-only')}</span></div>
    {error && <div role="alert" className="amadeus-browser-notice">{error}</div>}
    {state?.failed && <div role="alert" className="amadeus-browser-notice">{tr('浏览器已退出。', 'Browser exited.')} <button disabled={retrying} onClick={retry}>{retrying ? tr('连接中…', 'Connecting…') : tr('重新连接', 'Reconnect')}</button></div>}
    <div className="amadeus-browser-viewport">
      {!connected && !state?.failed && <div className="amadeus-browser-status" role="status">{tr('正在连接 AI 浏览器画面…', 'Connecting to AI browser…')}</div>}
      <canvas ref={canvas} width="1280" height="800" aria-label={tr('AI 浏览器只读画面', 'Read-only AI browser viewport')} />
    </div>
    <div className="amadeus-browser-footer">{tr('AI 操作过程 · 只读观看', 'AI browser activity · read-only viewing')}</div>
  </section>;
}

export function apply(ctx) {
  setAmadeusLocale(ctx.locale);
  ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind, priority: 'extension', multiple: false, keepMounted: true, title: () => tr('AI 浏览器', 'AI Browser'), guide: [{ id: 'ai-browser', order: 13, title: () => tr('AI 浏览器', 'AI Browser'), description: () => tr('查看 AI 正在操作的网页', 'Watch the page AI is controlling') }] }));
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, props => <BrowserTab {...props} />)));
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: id }, BrowserTitle)));
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style); return () => style.remove(); });
  ctx.effect(() => {
    const policy = new Map(), events = new EventSource('/amadeus/browser/events');
    events.onopen = () => { transportGeneration++; states.clear(); for (const notify of listeners) notify(); };
    events.onmessage = event => {
      try {
        const state = JSON.parse(event.data); if (!publish(state)) return;
        const selectedSession = ctx.sidebarRight.mounted.getSnapshot();
        if (shouldRevealBrowser(policy, state, { selectedSession, expanded: ctx.sidebarRight.isExpanded() })) ctx.sidebarRight.openTab(kind);
      } catch (error) { console.error('[Amadeus browser]', error); }
    };
    return () => { events.close(); states.clear(); };
  });
}
