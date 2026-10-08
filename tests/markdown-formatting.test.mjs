import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { groupSafeInlineHtml } from '../packages/reader/src/inline-html.mjs';
import { patchMarkdownFormatting, patchFrontendMarkdown } from '../scripts/dsh-markdown-patch.mjs';
const html = value => ({type:'html',value});
const text = value => ({type:'text',value});

test('groups safe inline formatting across Markdown AST children and complete HTML fragments',()=>{
  const strong={type:'strong',children:[text('file.pdf')]};
  assert.deepEqual(groupSafeInlineHtml([html('<u>'),strong,html('</u>')]),[{type:'amadeus-inline-format',tag:'u',children:[strong]}]);
  assert.deepEqual(groupSafeInlineHtml([html('<u>H<sub>2</sub>O</u><br/>next')]),[{type:'amadeus-inline-format',tag:'u',children:[text('H'),{type:'amadeus-inline-format',tag:'sub',children:[text('2')]},text('O')]},{type:'break'},text('next')]);
});
test('the shipped frontend renderer is patched as well as the library source',async()=>{
  const html=await readFile('node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html','utf8');
  const asset=/src="\.\/assets\/(index-[^"]+\.js)"/.exec(html)[1];
  const source=await readFile(`node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/${asset}`,'utf8');
  const patched=patchFrontendMarkdown(source);assert.equal(patchFrontendMarkdown(patched),patched);
  assert.throws(()=>patchFrontendMarkdown('changed upstream'),/Unsupported DSH frontend/);
});
test('incomplete tags, attributes, unknown HTML and code remain literal',()=>{
  for(const value of ['<u>','<u onclick="alert(1)">text</u>','<script>alert(1)</script>','<img src=x onerror=alert(1)>','<div><u>text</u></div>','</u>','<u/>']){
    const nodes=[html(value)];assert.equal(groupSafeInlineHtml(nodes),nodes);
  }
  const nodes=[{type:'code',value:'<u>code</u>'},{type:'inlineCode',value:'<sup>code</sup>'}];assert.equal(groupSafeInlineHtml(nodes),nodes);
});
test('native Markdown patch is idempotent and rejects an unknown renderer',async()=>{
  const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js','utf8');
  const patched=patchMarkdownFormatting(source);assert.equal(patchMarkdownFormatting(patched),patched);
  assert.throws(()=>patchMarkdownFormatting('changed upstream'),/Unsupported DSH Markdown renderer/);
});
