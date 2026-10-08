import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserManager } from '../packages/browser/src/manager.mjs';
import { shouldRevealBrowser } from '../packages/browser/src/client-state.mjs';

test('browser reveal is per conversation and once per run', () => {
  const policy = new Map();
  const state = { sessionId: 'one', reveal: { runId: 'first', id: 'a' } };
  assert.equal(shouldRevealBrowser(policy, state, { selectedSession: 'two', expanded: false }), false);
  assert.equal(shouldRevealBrowser(policy, state, { selectedSession: 'one', expanded: false }), true);
  assert.equal(shouldRevealBrowser(policy, state, { selectedSession: 'one', expanded: true }), false);
  assert.equal(shouldRevealBrowser(policy, { ...state, reveal: { runId: 'first', id: 'b' } }, { selectedSession: 'one', expanded: false }), false);
  assert.equal(shouldRevealBrowser(policy, { ...state, reveal: { runId: 'second', id: 'c' } }, { selectedSession: 'one', expanded: false }), true);
});
test('AI operations remain serialized without a user takeover gate', async () => {
  const manager = new BrowserManager({ stateDir: '/unused' });
  manager.publish = () => {}; manager.refresh = async () => {};
  const entry = { tail: Promise.resolve(), pages: new Map() };const seen=[];
  const exec={name:'mcp__playwright-mcp__browser_evaluate',signal:new AbortController().signal};
  const calls=[1,2].map(n=>manager.runAI(entry,exec,async()=>{seen.push(n);await new Promise(resolve=>setTimeout(resolve,10));seen.push(-n);return {isError:false};}));
  await Promise.all(calls);assert.deepEqual(seen,[1,-1,2,-2]);
});
