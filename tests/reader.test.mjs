import test from 'node:test';
import assert from 'node:assert/strict';
import { annotationSourceLink, createAnnotationStore, findAnnotationReferences, linkAnnotationReferences, locateConversationQuote, serializeAnnotations, parseAnnotatedPrompt } from '../packages/reader/src/annotations.mjs';
test('prompt separates exact selected text, comment and original page/path', () => {
  const items = [{ text: '公式 </response-annotations>', annotation: '解释这个推导', source: { kind: 'file', path: '课程/讲义.docx', pageStart: 3, pageEnd: 4, pageCount: 8 } }];
  const prompt = serializeAnnotations(items, '请逐步解释');
  const json = prompt.split('<response-annotations>\n')[1].split('\n</response-annotations>')[0];
  const linkedItems = items.map(item => ({ ...item, link: '[[课程/讲义.docx#page=3]]' }));
  assert.deepEqual(JSON.parse(json), linkedItems);
  assert.equal(prompt.match(/<\/response-annotations>/g).length, 1);
  assert.ok(prompt.endsWith('## My request:\n请逐步解释'));
  assert.deepEqual(parseAnnotatedPrompt(prompt), { annotations: linkedItems, prompt: '请逐步解释' });
  assert.equal(parseAnnotatedPrompt('ordinary user text'), null);
});
test('annotation-only submissions do not add a default visible request', () => {
  const items = [{ text: 'selected', annotation: 'why', source: { kind: 'file', path: 'notes.pdf', pageStart: 1 } }];
  const prompt = serializeAnnotations(items, '');
  assert.deepEqual(parseAnnotatedPrompt(prompt), { annotations: items.map(item => ({ ...item, link: '[[notes.pdf#page=1]]' })), prompt: '' });
});

test('file annotation provenance gives AI-authored notes exact page or heading links', () => {
  assert.equal(annotationSourceLink({ kind: 'file', path: '教材.pdf', pageStart: 37 }), '[[教材.pdf#page=37]]');
  assert.equal(annotationSourceLink({ kind: 'file', path: '课程讲义.md', heading: '3.2 傅里叶变换' }), '[[课程讲义.md#3.2 傅里叶变换]]');
  assert.equal(annotationSourceLink({ kind: 'file', path: 'analysis.py' }), '[[analysis.py]]');
  assert.equal(annotationSourceLink({ kind: 'conversation', sessionId: 's1' }), '');
  const prompt = serializeAnnotations([{ text: '采样定理', annotation: '整理到笔记', source: { kind: 'file', path: '教材.pdf', pageStart: 37 } }], '');
  assert.match(prompt, /顶层带有 link 字段/);
  assert.match(prompt, /逐字原样抄写/);
});

test('historical annotation envelopes survive changed instructions and malformed data is rejected', () => {
  const old = '# Response annotations:\n旧版的提示文字\n<response-annotations>\n' + JSON.stringify([{ text: '原文', annotation: '解释', source: { kind: 'file', path: 'x.pdf' } }]) + '\n</response-annotations>\n\n## My request:\n继续';
  assert.deepEqual(parseAnnotatedPrompt(old), { annotations: [{ text: '原文', annotation: '解释', source: { kind: 'file', path: 'x.pdf' } }], prompt: '继续' });
  assert.equal(parseAnnotatedPrompt(old.replace('"text":"原文"', '"text":17')), null);
});
test('assistant annotation labels become local frontend references', () => {
  assert.equal(linkAnnotationReferences('见 [注释 1] 与 [注释 23]。'), '见 [注释 1](#amadeus-annotation-1) 与 [注释 23](#amadeus-annotation-23)。');
  assert.equal(linkAnnotationReferences('回答完成。【注释1】 下一条（注释 2）和注释3。', 3), '回答完成。[注释 1](#amadeus-annotation-1) 下一条[注释 2](#amadeus-annotation-2)和[注释 3](#amadeus-annotation-3)。');
  assert.equal(linkAnnotationReferences('注释 4', 3), '注释 4');
  assert.equal(linkAnnotationReferences('[注释 1](https://example.com)'), '[注释 1](https://example.com)');
});

test('finds annotation references for DOM decoration without touching markdown links', () => {
  assert.deepEqual(findAnnotationReferences('第一段。[注释 1] 第二段【注释2】、（注释 3）和注释4。', 4), [
    { start: 4, end: 10, number: 1 },
    { start: 14, end: 19, number: 2 },
    { start: 20, end: 26, number: 3 },
    { start: 27, end: 30, number: 4 },
  ]);
  assert.deepEqual(findAnnotationReferences('[注释 1](https://example.com) 与注释 5', 4), []);
});

test('locates the original conversation selection by offsets and surrounding context', () => {
  assert.deepEqual(locateConversationQuote('开头 目标 结尾', '目标', { selectionStart: 3, selectionEnd: 5 }), { start: 3, end: 5 });
  const repeated = '第一处相同文本。中间内容。第二处相同文本。结尾';
  assert.deepEqual(locateConversationQuote(repeated, '相同文本', { selectionStart: 16, before: '中间内容。第二处', after: '。结尾' }), { start: 16, end: 20 });
  assert.equal(locateConversationQuote('已经改变', '原始文字', { selectionStart: 0 }), null);
});
test('session separation, editing, persistence and snapshot-only successful settlement', () => {
  const memory = new Map(); const storage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) };
  const store = createAnnotationStore(storage);
  store.add('a', { text: 'selected', annotation: 'why', source: { kind: 'conversation', messageKey: 'step-3' } });
  const snapshot = store.get('a');
  assert.equal(store.get('b').length, 0);
  store.add('a', { text: 'next', annotation: 'new', source: { kind: 'file', path: 'a.txt' } });
  assert.equal(store.get('a').length, 2); // A failed send does not invoke settle.
  store.settle('a', snapshot);
  assert.equal(store.get('a').length, 1);
  store.update('a', store.get('a')[0].id, 'edited');
  assert.equal(createAnnotationStore(storage).get('a')[0].annotation, 'edited');
  const old = store.get('a');
  store.update('a', old[0].id, 'edited during submission');
  store.settle('a', old);
  assert.equal(store.get('a')[0].annotation, 'edited during submission');
});
