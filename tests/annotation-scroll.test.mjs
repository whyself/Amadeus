import test from 'node:test';
import assert from 'node:assert/strict';
import { animateQuoteNavigation } from '../packages/reader/src/annotation-scroll.mjs';

function fixture() {
  let top = 1800, quoteTop = 600, time = 0, frameId = 0, retained;
  const frames = new Map(), writes = [], attributes = new Set();
  const win = { requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); } };
  const scroller = { setAttribute: name => attributes.add(name), hasAttribute: name => attributes.has(name), getBoundingClientRect: () => ({ top: 0, bottom: 600 }) };
  const row = { isConnected: true, dataset: { chatAnchorKey: 'source' }, ownerDocument: { defaultView: win }, getBoundingClientRect: () => ({ top: quoteTop - top - 100 }) };
  const range = { getBoundingClientRect: () => ({ top: quoteTop - top, height: 20 }) };
  const viewport = { elements: { scroller, composer: { getBoundingClientRect: () => ({ top: 500 }) } }, metrics: () => ({ top, floor: 2400 }), write(next, metrics, turn, anchor) {
    writes.push(next); top = next;
    return { turn, position: { anchorKey: anchor.key, anchorTop: anchor.top - next + metrics.top, scrollTop: next } };
  }, beginPreserving(position) { attributes.clear(); retained = position; } };
  const reading = { acceptNavigation() {} };
  const nextFrame = () => { const callbacks = [...frames.values()]; frames.clear(); time += 16; for (const callback of callbacks) callback(time); };
  return { viewport, reading, range, row, writes, frames, attributes, nextFrame, get retained() { return retained; }, moveQuote(delta) { quoteTop += delta; } };
}

test('quote navigation progresses over frames, follows layout movement and retains the final source position', () => {
  const f = fixture(); animateQuoteNavigation({ ...f, turn: null });
  assert.equal(f.writes.length, 0);
  f.nextFrame(); assert.ok(f.writes[0] > 360 && f.writes[0] < 1800);
  f.moveQuote(80);
  for (let i = 0; i < 50 && f.frames.size; i++) f.nextFrame();
  assert.ok(f.writes.length > 15); assert.equal(f.frames.size, 0);
  assert.equal(f.viewport.annotationAnimation, null);
  assert.equal(f.writes.at(-1), 440);
  assert.deepEqual(f.retained, { anchorKey: 'source', anchorTop: 140, scrollTop: 440 });
  assert.ok(f.attributes.has('data-amadeus-quote-navigation'));
});

test('user interruption, detachment and replacement cancel outstanding animation frames', () => {
  for (const interrupt of [f => f.attributes.clear(), f => { f.row.isConnected = false; }, f => { f.viewport.elements = null; }]) {
    const f = fixture(); animateQuoteNavigation({ ...f, turn: 1 }); f.nextFrame();
    interrupt(f); const count = f.writes.length; f.nextFrame();
    assert.equal(f.writes.length, count); assert.equal(f.frames.size, 0); assert.equal(f.viewport.annotationAnimation, null);
  }
  const f = fixture(); animateQuoteNavigation({ ...f, turn: 1 });
  animateQuoteNavigation({ ...f, turn: 2 }); assert.equal(f.frames.size, 1);
  f.viewport.annotationAnimation(); assert.equal(f.frames.size, 0);
});
