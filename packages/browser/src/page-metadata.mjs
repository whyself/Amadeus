// Icons are loaded through the controlled browser's request context so logged-in
// pages work without exposing their cookies or requiring viewer-side cross-origin access.
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']);
const maxIconBytes = 256 * 1024;

export async function readPageMetadata(page, cached = {}, onTitle = () => {}) {
  const metadata = await page.evaluate(() => {
    const icons = [...document.querySelectorAll('link[rel~="icon" i]')];
    const icon = icons.find(link => /(?:^|\s)(?:16x16|32x32|any)(?:\s|$)/i.test(link.getAttribute('sizes') || '')) || icons.at(-1);
    return { title: document.title, ready: document.readyState, url: location.href, icon: icon?.href || (/^https?:$/.test(location.protocol) ? new URL('/favicon.ico', location.href).href : null) };
  });
  const title = metadata.title.trim() || (metadata.ready === 'complete' ? '' : cached.title || '');
  onTitle({ title, url: metadata.url });
  const key = `${metadata.url}\n${metadata.icon || ''}`;
  if (cached.key === key) return { ...cached, title };
  const result = { key, title, favicon: null };
  if (!metadata.icon) return result;
  if (/^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)[;,]/i.test(metadata.icon)) {
    if (metadata.icon.length < maxIconBytes) result.favicon = metadata.icon;
    return result;
  }
  if (!/^https?:\/\//i.test(metadata.icon)) return result;
  let response;
  try {
    response = await page.context().request.get(metadata.icon, { timeout: 4000, maxRedirects: 3 });
    const type = response.headers()['content-type']?.split(';')[0].trim().toLowerCase();
    if (response.ok() && imageTypes.has(type)) {
      const bytes = await response.body();
      if (bytes.length && bytes.length <= maxIconBytes) result.favicon = `data:${type};base64,${bytes.toString('base64')}`;
    }
  } catch {} finally { await response?.dispose().catch(() => {}); }
  return result;
}
