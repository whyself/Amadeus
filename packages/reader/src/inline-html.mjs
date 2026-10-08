// Group a small formatting vocabulary in mdast, never parse arbitrary DOM HTML.
// Inline code/fences stay untouched; incomplete streaming tags remain literal.
export function groupSafeInlineHtml(nodes) {
  const tokens = [];
  for (const node of nodes) {
    if (node.type !== 'html') { tokens.push(node); continue; }
    const matches = [...node.value.matchAll(/<[^>]*>/g)];
    const parsed = matches.map(match => /^<(\/?)(u|sub|sup|br)\s*(\/?)>$/i.exec(match[0]));
    if (!matches.length || parsed.some(tag => !tag || (tag[1] && tag[3]) || (tag[2].toLowerCase() === 'br' && tag[1]) || (tag[2].toLowerCase() !== 'br' && tag[3]))) {
      tokens.push(node); continue;
    }
    let offset = 0;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i], tag = parsed[i];
      if (match.index > offset) tokens.push({ type: 'text', value: node.value.slice(offset, match.index) });
      tokens.push({ type: 'amadeus-tag', tag: tag[2].toLowerCase(), closing: !!tag[1], literal: { type: 'html', value: match[0] } });
      offset = match.index + match[0].length;
    }
    if (offset < node.value.length) tokens.push({ type: 'text', value: node.value.slice(offset) });
  }
  const root = [], stack = [{ children: root }];
  let changed = false;
  for (const token of tokens) {
    const current = stack.at(-1);
    if (token.type !== 'amadeus-tag') { current.children.push(token); continue; }
    if (token.tag === 'br') { current.children.push({ type: 'break' }); changed = true; }
    else if (!token.closing) stack.push({ tag: token.tag, literal: token.literal, children: [] });
    else if (stack.length > 1 && current.tag === token.tag) {
      stack.pop();stack.at(-1).children.push({ type: 'amadeus-inline-format', tag: current.tag, children: current.children });changed = true;
    } else current.children.push(token.literal);
  }
  while (stack.length > 1) {
    const current = stack.pop();stack.at(-1).children.push(current.literal,...current.children);
  }
  return changed ? root : nodes;
}
