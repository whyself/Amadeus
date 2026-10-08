import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { groupSafeInlineHtml } from '../packages/reader/src/inline-html.mjs';

const CHILDREN = 'return nodes.map((node, index) => renderNode(node, index, context));';
const GROUPED = 'return amadeusInlineHtml(nodes).map((node, index) => renderNode(node, index, context));';
const HTML = 'case "html": return node.value;';
const SAFE_HTML = `case "amadeus-inline-format": return jsx(node.tag, { children: renderChildren(node.children, context) }, key);
\t\tcase "html": {
\t\t\tconst nodes = amadeusInlineHtml([node]);
\t\t\treturn nodes.length === 1 && nodes[0] === node ? node.value : jsx(Fragment$1, { children: renderChildren(nodes, context) }, key);
\t\t}`;
const BEGIN = '\n// Amadeus safe inline HTML formatting\n';
const END = '\n// End Amadeus safe inline HTML formatting\n';
function amadeusShortcutReference(node, context) {
  if (node.referenceType !== 'shortcut' || context.targets.definitions.has(node.identifier.toUpperCase()) || node.children.length !== 1 || node.children[0].type !== 'text') return undefined;
  return globalThis.__amadeusAnnotationReferenceText?.(`[${node.children[0].value}]`,context.inLink);
}
const helpers = () => groupSafeInlineHtml.toString().replace('groupSafeInlineHtml','amadeusInlineHtml')+'\n'+amadeusShortcutReference.toString();

export function patchMarkdownFormatting(source) {
  let result = source;
  for (const [before, after] of [[CHILDREN, GROUPED], [HTML, SAFE_HTML], ['case "text": return node.value;', 'case "text": return globalThis.__amadeusAnnotationReferenceText?.(node.value, context.inLink) ?? node.value;'], ['case "linkReference": return renderLinkReference(node, key, context);', 'case "linkReference": return amadeusShortcutReference(node, context) ?? renderLinkReference(node, key, context);']]) {
    if (result.includes(after)) continue;
    const count = result.split(before).length - 1;
    if (count !== 1) throw new Error(`Unsupported DSH Markdown renderer: expected one formatting anchor, found ${count}`);
    result = result.replace(before,after);
  }
  const variant = '"data-markdown-variant": variant === "compact" ? variant : void 0,';
  if (!result.includes('"data-amadeus-native-markdown": true,')) {
    if (result.split(variant).length !== 2) throw new Error('Unsupported Markdown ownership marker');
    result = result.replace(variant,variant+'\n\t\t"data-amadeus-native-markdown": true,');
  }
  const refStart = result.indexOf('function renderLinkReference('), refEnd = result.indexOf('function renderImageReference(',refStart);
  if (refStart < 0 || refEnd < 0) throw new Error('Unsupported Markdown reference context');
  const refBody = result.slice(refStart,refEnd).replace('renderChildren(node.children, context)','renderChildren(node.children, { ...context, inLink: true })');
  result = result.slice(0,refStart)+refBody+result.slice(refEnd);
  const start = result.indexOf(BEGIN);
  if (start >= 0) {
    const end = result.indexOf(END,start);
    if (end < 0) throw new Error('Incomplete Amadeus Markdown formatting patch');
    result = result.slice(0,start)+result.slice(end+END.length);
  }
  return result+BEGIN+helpers()+END;
}

export function patchFrontendMarkdown(source) {
  const match = /function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{switch\(\2\.type\)\{case"text":return [^;]+;case"paragraph":return ([\w$]+)\.jsx\("p",\{children:([\w$]+)\(\2\.children,\4\)\},\3\);/.exec(source);
  if (!match) throw new Error('Unsupported DSH frontend Markdown renderer');
  const [,render,node,key,context,jsx,children] = match;
  let result = source;
  if (!result.includes('"data-amadeus-native-markdown":!0,')) {
    const variant = /"data-markdown-variant":([^,]+),children:/;
    if (!variant.test(result)) throw new Error('Unsupported frontend Markdown ownership marker');
    result = result.replace(variant,'"data-markdown-variant":$1,"data-amadeus-native-markdown":!0,children:');
  }
  const text = `case"text":return ${node}.value;case"paragraph":`;
  const projected = `case"text":return globalThis.__amadeusAnnotationReferenceText?.(${node}.value,${context}.inLink)??${node}.value;case"paragraph":`;
  if (!result.includes(projected)) {
    if (result.split(text).length !== 2) throw new Error('Unsupported frontend text renderer');
    result = result.replace(text,projected);
  }
  const reference = new RegExp(`case"linkReference":return (?:amadeusShortcutReference\\(${node},${context}\\)\\?\\?)?([\\w$]+)\\(${node},${key},${context}\\);`);
  const refFunction = reference.exec(result)?.[1];
  if (!refFunction) throw new Error('Unsupported frontend reference context');
  const parameters = new RegExp(`function ${refFunction.replaceAll('$','\\$')}\\(([\\w$]+),([\\w$]+),([\\w$]+)\\)`).exec(result);
  if (!parameters) throw new Error('Unsupported frontend reference parameters');
  const child = `["[",${children}(${parameters[1]}.children,${parameters[3]}),`;
  const protectedChild = `["[",${children}(${parameters[1]}.children,{...${parameters[3]},inLink:!0}),`;
  if (!result.includes(protectedChild)) {
    if (result.split(child).length !== 2) throw new Error('Unsupported frontend literal reference children');
    result = result.replace(child,protectedChild);
  }
  if (!result.includes(`case"linkReference":return amadeusShortcutReference(`)) {
    const original = reference.exec(result);
    if (!original) throw new Error('Unsupported frontend shortcut reference renderer');
    result = result.replace(original[0],`case"linkReference":return amadeusShortcutReference(${node},${context})??${original[1]}(${node},${key},${context});`);
  }
  if (!result.includes(`return amadeusInlineHtml(`)) {
    const pattern = new RegExp(`function ${children.replaceAll('$','\\$')}\\(([\\w$]+),([\\w$]+)\\)\\{return \\1\\.map\\(\\(([\\w$]+),([\\w$]+)\\)=>${render.replaceAll('$','\\$')}\\(\\3,\\4,\\2\\)\\)\\}`);
    const mapping = pattern.exec(result);
    if (!mapping) throw new Error('Unsupported DSH frontend Markdown children');
    result = result.replace(mapping[0],mapping[0].replace(`return ${mapping[1]}.map`,`return amadeusInlineHtml(${mapping[1]}).map`));
  }
  const marker = 'case"amadeus-inline-format":';
  if (!result.includes(marker)) {
    const original = `case"html":return ${node}.value;case"code":`;
    if (result.split(original).length !== 2) throw new Error('Unsupported DSH frontend HTML renderer');
    const replacement = `${marker}return ${jsx}.jsx(${node}.tag,{children:${children}(${node}.children,${context})},${key});case"html":{const nodes=amadeusInlineHtml([${node}]);return nodes.length===1&&nodes[0]===${node}?${node}.value:${jsx}.jsx(${jsx}.Fragment,{children:${children}(nodes,${context})},${key})}case"code":`;
    result = result.replace(original,replacement);
  }
  const start = result.indexOf(BEGIN);
  if (start >= 0) {
    const end = result.indexOf(END,start);
    if (end < 0) throw new Error('Incomplete frontend formatting patch');
    result = result.slice(0,start)+result.slice(end+END.length);
  }
  return result+BEGIN+helpers()+END;
}

export async function patchDshMarkdown(root) {
  const directory = path.join(root,'node_modules/@deepseek-ai/dsh-client-ui-primitives');
  const manifest = JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
  if (manifest.version !== '0.2.1-alpha.1') throw new Error(`Unsupported DSH Markdown version: ${manifest.version}`);
  const file = path.join(directory,'lib/index.js');
  const before = await readFile(file,'utf8'), after = patchMarkdownFormatting(before);
  const frontend = path.join(root,'node_modules/@deepseek-ai/dsh-web-frontend');
  const version = JSON.parse(await readFile(path.join(frontend,'package.json'),'utf8')).version;
  if (version !== '0.2.1-alpha.1') throw new Error(`Unsupported DSH frontend version: ${version}`);
  const htmlFile = path.join(frontend,'dist/index.html'), html = await readFile(htmlFile,'utf8');
  const entry = /(<script\b[^>]*\bsrc=")(\.\/assets\/index-[^"/]+\.js)("[^>]*>)/.exec(html);
  if (!entry) throw new Error('Unsupported DSH frontend entry');
  const input = await readFile(path.join(frontend,'dist',entry[2]),'utf8');
  const output = patchFrontendMarkdown(input), hash = createHash('sha256').update(output).digest('hex').slice(0,12);
  const base = entry[2].replace(/-amadeus-inline-[a-f0-9]+(?=\.js$)/,'');
  const address = base.replace(/\.js$/,`-amadeus-inline-${hash}.js`);
  // A fresh URL also invalidates the PWA's cached copy of the stock renderer.
  if (output !== input || address !== entry[2]) await writeFile(path.join(frontend,'dist',address),output);
  const next = html.replace(entry[0],entry[1]+address+entry[3]);
  if (next !== html) await writeFile(htmlFile,next);
  if (before !== after) await writeFile(file,after);
}
