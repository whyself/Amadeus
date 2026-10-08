import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ANCHOR = 'function UserStyleBubble({ content, renderMessageImages, actions, pending = false, echo = false, referenceLabels = [], skillNames = [], previewAttachments, references, t }) {';
const DISPLAY_HOOK = '\n\t\t\tcontent = globalThis.__amadeusAnnotationContent?.(content) ?? content;';
const BUBBLE_HOOK = '\n\t\t\tconst annotationView = globalThis.__amadeusAnnotationBubble?.({ content, previewAttachments, renderMessageImages, pending, echo });\n\t\t\tif (annotationView != null) return annotationView;';
const QUEUE_PREVIEW = 'function previewOf(content) {';
const QUEUE_PENDING = '(0, _deepseek_ai_dsh_client_ui_primitives.projectUserText)(submission.text, [])';
const QUEUE_PROJECTED = '(0, _deepseek_ai_dsh_client_ui_primitives.projectUserText)(globalThis.__amadeusAnnotationContent?.([{ type: "text", text: submission.text }])?.[0]?.text ?? submission.text, [])';
export const ANNOTATION_NAVIGATION = `annotationNavigate: (request) => {
  const range = request?.range, elements = viewport.elements;
  if (!range || !elements || !elements.list.contains(range.startContainer) || !elements.list.contains(range.endContainer)) return;
  viewport.annotationAnimation?.();navigation.cancel();reading.pauseFollowing();
  const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const row = node.closest('[data-chat-anchor-key]');
  if (!row) return;
  const id = Number(row.dataset.chatTurn), turn = Number.isSafeInteger(id) ? id : null;
  if (typeof request.animate === 'function' && !elements.scroller.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    request.handled = true;request.animate({viewport,reading,range,row,turn});return;
  }
  viewport.align(row, 24, turn);
  const rect = range.getBoundingClientRect(), bounds = elements.scroller.getBoundingClientRect();
  const bottom = elements.composer?.getBoundingClientRect().top ?? bounds.bottom;
  const height = Math.max(0, Math.min(bounds.bottom, bottom) - bounds.top);
  const metrics = viewport.metrics();
  if (!metrics || !rect.height || !height) return;
  const landing = viewport.write(metrics.top + rect.top - bounds.top - height / 2 + Math.min(rect.height, height) / 2, metrics, turn, { key: row.dataset.chatAnchorKey, top: row.getBoundingClientRect().top - bounds.top });
  if (landing) {
    reading.acceptNavigation(landing);viewport.beginPreserving(landing.position);
    elements.scroller.setAttribute('data-amadeus-quote-navigation','');request.handled = true;
  }
},`;

function patchAnnotationNavigation(source) {
  const patches = [
    ['scroller.addEventListener("scroll", this.onScroll, { passive: true });','scroller.addEventListener("scroll", this.onScroll, { passive: true });\n\t\t\t\tscroller.addEventListener("amadeus:annotation-jump", this.onAnnotationJump);'],
    ['this.elements?.scroller.removeEventListener("scroll", this.onScroll);','this.elements?.scroller.removeEventListener("scroll", this.onScroll);\n\t\t\t\tthis.elements?.scroller.removeEventListener("amadeus:annotation-jump", this.onAnnotationJump);'],
    ['onIntent = (event) => {','onAnnotationJump = (event) => { this.events?.annotationNavigate?.(event.detail); };\n\t\t\tonIntent = (event) => {'],
    ['stopPreserving() {','stopPreserving() {\n\t\t\t\tthis.elements?.scroller.removeAttribute("data-amadeus-quote-navigation");'],
    ['if (this.paging === null) return;','if (this.annotationAnimation) { this.annotationAnimation();this.elements?.scroller.removeAttribute("data-amadeus-quote-navigation"); }\n\t\t\t\tif (this.paging === null) return;'],
  ];
  let result=source;
  for(const[before,after]of patches){
    if(result.includes(after))continue;
    const count=result.split(before).length-1;
    if(count!==1)throw new Error(`Unsupported DSH annotation navigation anchor: found ${count}`);
    result=result.replace(before,after);
  }
  const connect='const disconnectViewport = viewport.connect({';
  const begin=result.indexOf(connect)+connect.length, end=result.indexOf('scroll: reading.onScroll,',begin);
  if(begin<connect.length||end<begin)throw new Error('Unsupported native annotation navigation connection');
  const previous=result.slice(begin,end).trim();
  if(previous&&!previous.startsWith('annotationNavigate:')&&!previous.startsWith('// Amadeus annotation navigation'))throw new Error('Unsupported annotation navigation prelude');
  result=result.slice(0,begin)+'\n// Amadeus annotation navigation\n'+ANNOTATION_NAVIGATION+'\n// End Amadeus annotation navigation\n\t\t\t\t\t'+result.slice(end);
  return result;
}

// Projection occurs before React sees the optimistic/admitted steering bubble.
// The request, pending-submission state and durable event retain the full text.
export function projectAnnotationBubbles(source) {
  if (source.includes(ANCHOR + BUBBLE_HOOK + DISPLAY_HOOK)) return patchAnnotationNavigation(source);
  const count = source.split(ANCHOR).length - 1;
  if (count !== 1) throw new Error(`Unsupported DSH chat build: expected one user bubble, found ${count}`);
  const projected = source.includes(ANCHOR + DISPLAY_HOOK)
    ? source.replace(ANCHOR + DISPLAY_HOOK, ANCHOR + BUBBLE_HOOK + DISPLAY_HOOK)
    : source.replace(ANCHOR, ANCHOR + BUBBLE_HOOK + DISPLAY_HOOK);
  return patchAnnotationNavigation(projected);
}

export function projectAnnotationQueue(source) {
  let result = source;
  if (!result.includes(QUEUE_PREVIEW + DISPLAY_HOOK)) {
    const count = result.split(QUEUE_PREVIEW).length - 1;
    if (count !== 1) throw new Error(`Unsupported DSH queue build: expected one preview function, found ${count}`);
    result = result.replace(QUEUE_PREVIEW, QUEUE_PREVIEW + DISPLAY_HOOK);
  }
  if (!result.includes(QUEUE_PROJECTED)) {
    const count = result.split(QUEUE_PENDING).length - 1;
    if (count !== 1) throw new Error(`Unsupported DSH queue build: expected one pending preview, found ${count}`);
    result = result.replace(QUEUE_PENDING, QUEUE_PROJECTED);
  }
  return result;
}

export async function patchDshChat(root) {
  const patches = [];
  for (const [name, transform] of [['dsh-client-ui-chat', projectAnnotationBubbles], ['dsh-client-ui-conversation', projectAnnotationQueue]]) {
    const directory = path.join(root, `node_modules/@deepseek-ai/${name}`);
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    if (manifest.version !== '0.2.1-alpha.1') throw new Error(`Unsupported DSH chat version: ${manifest.version}`);
    const file = path.join(directory, 'lib/client.js');
    const before = await readFile(file, 'utf8'), after = transform(before);
    if (after !== before) patches.push({ file, after });
  }
  for (const { file, after } of patches) await writeFile(file, after);
}
