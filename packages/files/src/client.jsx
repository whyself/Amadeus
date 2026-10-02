import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { observeNativeFileActions } from './native-tree.mjs';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from '../../../ui/amadeus.css';
import themeStyles from '../../../ui/dsh-theme.css';
import { editableResource } from './editable-resource.mjs';
import { setAmadeusLocale, useAmadeusLocale, tr } from '../../reader/src/locale.mjs';
export const inject = ['slots', 'sidebarRight', 'locale'];
export function fileUrl(action, session, path, extra = {}) {
  const query = new URLSearchParams({ session, path, ...extra });
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return origin ? new URL(`/amadeus/files/${action}?${query}`, origin).href : `/amadeus/files/${action}?${query}`;
}
async function request(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) { const error = new Error(body.error); Object.assign(error, { status: response.status, ...body }); throw error; }
  return body;
}
function Arrow({ direction }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={direction === 'up' ? 'M12 16V3m-5 5 5-5 5 5' : 'M12 3v13m-5-5 5 5 5-5'} /><path d="M4 16v5h16v-5" /></svg>; }
function Trash() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg>; }
function Edit() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m14 5 5 5M3 21l5.5-1.2L20 8.3a2.8 2.8 0 0 0-4-4L4.5 15.8 3 21Z" /></svg>; }
function NativeFiles({ Native, editorOpen, ...props }) {
  const host = useRef();
  const [targets, setTargets] = useState([]);
  useLayoutEffect(() => observeNativeFileActions(host.current, setTargets), [props.sessionId]);
  return <section ref={host} className="amadeus-files amadeus-native-files"><Native {...props} /><FileOperations {...props} targets={targets} editorOpen={editorOpen} /></section>;
}
function FileOperations({ sessionId, useTabInfo, targets, refresh: reload, editorOpen }) {
  useAmadeusLocale();
  const { tab } = useTabInfo();
  const [error, setError] = useState(''), [busy, setBusy] = useState('');
  const [uploadTo, setUploadTo] = useState(null), [conflict, setConflict] = useState(null);
  const [removal, setRemoval] = useState(null), [removing, setRemoving] = useState(false), [checkingRemoval, setCheckingRemoval] = useState(null), [removeError, setRemoveError] = useState('');
  const files = useRef(), folder = useRef(), destination = useRef(''), controller = useRef(), conflictResolver = useRef();
  const generation = useRef(0);
  useEffect(() => { generation.current++; return () => { generation.current++; controller.current?.abort(); conflictResolver.current?.('cancel'); }; }, [sessionId, tab.id]);
  async function refresh() { reload(tab.id); }
  async function uploadFiles(selected) {
    if (!selected.length) return;
    setError(''); controller.current = new AbortController();
    try {
      for (let i = 0; i < selected.length; i++) {
        const item = selected[i], file = item.file || item, relative = item.directory || item.relative || file.webkitRelativePath || file.name;
        const target = [destination.current, relative].filter(Boolean).join('/');
        setBusy(`${i + 1}/${selected.length} · ${relative}`);
        if (item.directory) { await request(fileUrl('mkdir', sessionId, target), { method: 'POST', signal: controller.current.signal }); continue; }
        let extra = {};
        while (true) {
          try { await request(fileUrl('upload', sessionId, target, extra), { method: 'PUT', body: file, signal: controller.current.signal }); break; }
          catch (error) {
            if (error.status !== 409 || !error.version) throw error;
            const choice = await new Promise(resolve => { conflictResolver.current = resolve; setConflict(target); });
            setConflict(null); conflictResolver.current = null;
            if (choice === 'cancel') { controller.current.abort(); throw new Error(tr('上传已取消', 'Upload canceled')); }
            if (choice === 'skip') break;
            extra = { overwriteVersion: error.version };
          }
        }
      }
      await refresh();
    } catch (error) { setError(error.name === 'AbortError' ? tr('上传已取消，已完成的文件会保留。', 'Upload canceled. Completed files are kept.') : error.message); await refresh(); }
    finally { setBusy(''); if (files.current) files.current.value = ''; if (folder.current) folder.current.value = ''; }
  }
  async function chooseFolder() {
    destination.current = uploadTo; setUploadTo(null);
    if (!window.showDirectoryPicker) { setError(tr('当前浏览器仅支持按文件上传目录，空文件夹无法保留。使用支持目录选择的 HTTPS 浏览器可完整上传。', 'This browser uploads a folder as files, so empty folders cannot be kept. Use an HTTPS browser with folder selection for a complete upload.')); folder.current.click(); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      const entries = [];
      async function walk(directory, prefix) {
        entries.push({ directory: prefix });
        for await (const [name, entry] of directory.entries()) {
          if (entries.length >= 100000) throw new Error(tr('单次上传最多支持 100000 个目录项', 'An upload supports at most 100,000 folder entries'));
          const relative = prefix + '/' + name;
          if (entry.kind === 'directory') await walk(entry, relative);
          else entries.push({ file: await entry.getFile(), relative });
        }
      }
      await walk(handle, handle.name); await uploadFiles(entries);
    } catch (error) { if (error.name !== 'AbortError') setError(error.message); }
  }
  async function askRemoval(path) {
    const current = generation.current;
    setCheckingRemoval(path); setError(''); setRemoveError('');
    try {
      const preview = await request(fileUrl('remove-preview', sessionId, path));
      if (generation.current === current) setRemoval({ ...preview, sessionId });
    } catch (error) { if (generation.current === current) setError(error.message); }
    finally { if (generation.current === current) setCheckingRemoval(null); }
  }
  async function confirmRemoval() {
    if (!removal || removing) return;
    const current = generation.current, target = removal;
    setRemoving(true); setRemoveError('');
    try {
      await request(fileUrl('remove', target.sessionId, target.path, { version: target.version }), { method: 'DELETE' });
      if (generation.current !== current) return;
      setRemoval(null); setError(''); await refresh();
    } catch (error) { if (generation.current === current) setRemoveError(error.message); }
    finally { if (generation.current === current) setRemoving(false); }
  }
  function actions(path, directory) {
    const address = path && `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    return <span className="amadeus-actions amadeus-file-actions">
      {directory ? <button className="amadeus-icon" title={tr('上传文件或文件夹', 'Upload files or folder')} aria-label={`${tr('上传到', 'Upload to')} ${path || tr('项目根目录', 'project root')}`} disabled={!!busy || removing} onClick={() => setUploadTo(path)}><Arrow direction="up" /></button> : editableResource(address) ? <button className="amadeus-icon" title={tr('在编辑器中打开', 'Open in editor')} aria-label={`${tr('在编辑器中打开', 'Open in editor')} ${path}`} onClick={() => editorOpen(sessionId, address)}><Edit /></button> : <span className="amadeus-action-placeholder" aria-hidden="true" />}
      <a className="amadeus-icon" href={fileUrl('download', sessionId, path)} title={directory ? tr('下载文件夹（ZIP）', 'Download folder (ZIP)') : tr('下载文件', 'Download file')} aria-label={`${tr('下载', 'Download')} ${path || tr('项目', 'project')}`} download><Arrow direction="down" /></a>
      {path && <button className="amadeus-icon amadeus-file-remove" title={directory ? tr('删除文件夹', 'Delete folder') : tr('删除文件', 'Delete file')} aria-label={`${tr('删除', 'Delete')} ${path}`} disabled={!!busy || removing || checkingRemoval !== null} onClick={() => askRemoval(path)}><Trash /></button>}
    </span>;
  }
  return <>
    {targets.map(target => createPortal(actions(target.path, target.directory), target.host, target.root + '/' + target.path))}
    <input ref={files} type="file" multiple hidden aria-label="Upload files" onChange={e => uploadFiles([...e.target.files])} />
    <input ref={folder} type="file" multiple webkitdirectory="" hidden aria-label="Upload folder" onChange={e => uploadFiles([...e.target.files])} />
    {busy && <div className="amadeus-notice" role="status">{tr('正在上传', 'Uploading')} {busy}<button onClick={() => { conflictResolver.current?.('cancel'); controller.current?.abort(); }}>{tr('取消', 'Cancel')}</button></div>}
    {error && <p className="amadeus-error" role="alert">{error}</p>}
    <Modal open={uploadTo !== null} title={tr('上传资料', 'Upload files')} closeLabel={tr('关闭', 'Close')} onClose={() => setUploadTo(null)} className="amadeus-modal"><p className="amadeus-modal-path">{tr('上传到', 'Upload to')} {uploadTo || tr('项目根目录', 'project root')}</p><div className="amadeus-modal-actions"><Button onClick={() => { destination.current = uploadTo; setUploadTo(null); files.current.click(); }}>{tr('上传文件', 'Upload files')}</Button><Button variant="primary" onClick={chooseFolder}>{tr('上传文件夹', 'Upload folder')}</Button></div></Modal>
    <Modal open={conflict !== null} title={tr('文件已存在', 'File already exists')} closeLabel={tr('关闭', 'Close')} onClose={() => conflictResolver.current?.('cancel')} className="amadeus-modal"><p className="amadeus-modal-path">{conflict}</p><p>{tr('替换后将使用本次上传的版本。', 'The uploaded version will replace the existing file.')}</p><div className="amadeus-modal-actions"><Button onClick={() => conflictResolver.current?.('cancel')}>{tr('取消上传', 'Cancel upload')}</Button><Button onClick={() => conflictResolver.current?.('skip')}>{tr('跳过', 'Skip')}</Button><Button variant="primary" onClick={() => conflictResolver.current?.('replace')}>{tr('替换', 'Replace')}</Button></div></Modal>
    <Modal open={removal !== null} title={removal?.directory ? tr('删除文件夹？', 'Delete folder?') : tr('删除文件？', 'Delete file?')} closeLabel={tr('关闭', 'Close')} onClose={() => { if (!removing) setRemoval(null); }} className="amadeus-modal"><p className="amadeus-delete-path">{removal?.path}</p><p>{removal?.directory ? tr('文件夹及其中所有内容将被永久删除，无法撤销。', 'The folder and everything in it will be permanently deleted.') : tr('文件将被永久删除，无法撤销。', 'The file will be permanently deleted.')}</p>{removeError && <p className="amadeus-error" role="alert">{removeError}</p>}<div className="amadeus-modal-actions"><Button disabled={removing} onClick={() => setRemoval(null)}>{tr('取消', 'Cancel')}</Button><Button className="amadeus-confirm-delete" variant="primary" disabled={removing || !!removeError} onClick={confirmRemoval}>{removing ? tr('删除中…', 'Deleting…') : tr('删除', 'Delete')}</Button></div></Modal>
  </>;
}
export function apply(ctx) {
  setAmadeusLocale(ctx.locale);
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles + themeStyles; document.head.append(style); return () => style.remove(); });
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => {
    const wrapped = new Map(), listeners = new Set();
    let enabled = true;
    const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
    const install = () => {
      const candidates = ctx.slots.entries('sidebar.right.pane.tab').filter(row => row.options.key === '@deepseek-ai/dsh-client-ui-sidebar-files');
      for (const [entry, { Native, Wrapped }] of wrapped) if (!candidates.includes(entry)) {
        if (entry.component === Wrapped) entry.component = Native;
        wrapped.delete(entry);
      }
      for (const entry of candidates) {
        if (wrapped.has(entry)) continue;
        const Native = entry.component;
        function Wrapped(props) {
          const active = useSyncExternalStore(subscribe, () => enabled);
          return active ? <NativeFiles {...props} Native={Native} editorOpen={(sessionId, address) => ctx.sidebarRight.openTabIn(sessionId, 'amadeus-code-server', { params: { address } })} /> : <Native {...props} />;
        }
        entry.component = Wrapped; wrapped.set(entry, { Native, Wrapped });
      }
    };
    install(); const unsubscribe = ctx.slots.subscribe('sidebar.right.pane.tab', install);
    return () => {
      unsubscribe(); enabled = false;
      for (const listener of listeners) listener();
      for (const [entry, { Native, Wrapped }] of wrapped) if (entry.component === Wrapped) entry.component = Native;
      wrapped.clear();
    };
  }));
}
