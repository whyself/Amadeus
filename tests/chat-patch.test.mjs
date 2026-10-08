import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ANNOTATION_NAVIGATION, projectAnnotationBubbles, projectAnnotationQueue } from '../scripts/dsh-chat-patch.mjs';

test('chat annotation projection patches the shared pending/echo bubble once and refuses changed builds', async () => {
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js','utf8');
  const patched = projectAnnotationBubbles(source);
  assert.equal(projectAnnotationBubbles(patched),patched);
  assert.equal(patched.split('content = globalThis.__amadeusAnnotationContent?.(content) ?? content;').length-1,1);
  assert.ok(patched.indexOf('__amadeusAnnotationBubble?.')<patched.indexOf('content = globalThis.__amadeusAnnotationContent?.'));
  const previous=patched.replace('\n\t\t\tconst annotationView = globalThis.__amadeusAnnotationBubble?.({ content, previewAttachments, renderMessageImages, pending, echo });\n\t\t\tif (annotationView != null) return annotationView;','');
  assert.equal(projectAnnotationBubbles(previous),patched,'an installed previous patch is upgraded without duplicate display hooks');
  const legacyNavigation=patched.replace('// Amadeus annotation navigation\n','').replace('// End Amadeus annotation navigation\n','').replace(ANNOTATION_NAVIGATION,'annotationNavigate: (request) => { request.oldPolicy = true; },');
  const upgraded=projectAnnotationBubbles(legacyNavigation);assert.equal(upgraded,patched);assert.equal(upgraded.split('annotationNavigate:').length-1,1);
  assert.throws(()=>projectAnnotationBubbles('function changed() {}'),/Unsupported DSH chat build/);
});

test('quote navigation hands ownership to native reading and saves the source anchor without a turn',()=>{
  const calls=[],row={dataset:{chatAnchorKey:'source-user'},getBoundingClientRect:()=>({top:40})};
  const start={nodeType:1,closest:()=>row},range={startContainer:start,endContainer:start,getBoundingClientRect:()=>({top:140,height:20})};
  const viewport={elements:{list:{contains:()=>true},scroller:{getBoundingClientRect:()=>({top:0,bottom:600}),setAttribute:()=>calls.push(['native-anchor'])},composer:{getBoundingClientRect:()=>({top:500})}},align:(_row,_offset,turn)=>calls.push(['align',turn]),metrics:()=>({top:1000}),write:(top,_metrics,turn,position)=>{calls.push(['write',top,turn,position]);return{position};},beginPreserving:position=>calls.push(['preserve',position])};
  const reading={pauseFollowing:()=>calls.push(['pause']),acceptNavigation:landing=>calls.push(['accepted',landing.position])},navigation={cancel:()=>calls.push(['cancel'])};
  const navigate=Function('viewport','reading','navigation',`return ({${ANNOTATION_NAVIGATION}}).annotationNavigate`)(viewport,reading,navigation);
  const request={range};navigate(request);
  assert.deepEqual(calls,[['cancel'],['pause'],['align',null],['write',900,null,{key:'source-user',top:40}],['accepted',{key:'source-user',top:40}],['preserve',{key:'source-user',top:40}],['native-anchor']]);assert.equal(request.handled,true);
});

test('queued and pending-queue previews are projected before truncation without changing edit data', async () => {
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8');
  const patched = projectAnnotationQueue(source);
  assert.equal(projectAnnotationQueue(patched),patched);
  assert.ok(patched.includes('const text = textOf(row.content);'));
  assert.ok(patched.includes('text: editing.text'));
  assert.throws(()=>projectAnnotationQueue('function changed() {}'),/Unsupported DSH queue build/);
});

test('native quote navigation uses the animation callback unless reduced motion is requested', () => {
  for (const reduced of [false, true]) {
    const row={dataset:{chatAnchorKey:'source',chatTurn:'2'},getBoundingClientRect:()=>({top:100})};
    const node={nodeType:1,closest:()=>row},range={startContainer:node,endContainer:node,getBoundingClientRect:()=>({top:120,height:20})};
    let animated=0, writes=0;
    const viewport={elements:{list:{contains:()=>true},scroller:{ownerDocument:{defaultView:{matchMedia:()=>({matches:reduced})}},getBoundingClientRect:()=>({top:0,bottom:600}),setAttribute(){} }},align(){},metrics:()=>({top:1000}),write(){writes++;return{position:{}};},beginPreserving(){}};
    const reading={pauseFollowing(){},acceptNavigation(){}},navigation={cancel(){}};
    const navigate=Function('viewport','reading','navigation',`return ({${ANNOTATION_NAVIGATION}}).annotationNavigate`)(viewport,reading,navigation);
    const request={range,animate:options=>{assert.equal(options.turn,2);assert.equal(options.viewport,viewport);animated++;}};
    navigate(request);assert.equal(request.handled,true);assert.equal(animated,reduced?0:1);assert.equal(writes,reduced?1:0);
  }
});

test('native reader intent cancels quote animation before the first frame creates paging ownership', async () => {
  const source=projectAnnotationBubbles(await readFile('node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js','utf8'));
  const start=source.indexOf('onIntent = (event) => {'),end=source.indexOf('\n\t\t\t};',start);
  class Element { closest() { return null; } }
  class KeyboardEvent {}
  const intent=Function('Element','KeyboardEvent','SCROLL_KEYS',`return function(event) ${source.slice(start+'onIntent = (event) => '.length,end)+'\n}'}`)(Element,KeyboardEvent,new Set(['PageDown']));
  for (const event of [{type:'wheel'},{type:'touchstart'},Object.assign(new KeyboardEvent(),{type:'keydown',key:'PageDown'})]) {
    let canceled=0,removed=0;
    const viewport={paging:null,annotationAnimation(){canceled++;},elements:{scroller:{removeAttribute(){removed++;}}}};
    intent.call(viewport,event);assert.equal(canceled,1);assert.equal(removed,1);
  }
});
