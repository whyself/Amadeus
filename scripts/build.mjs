import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selected = process.argv.slice(2);
for (const name of ['login', 'files', 'reader', 'editor', 'browser'].filter(name => !selected.length || selected.includes(name))) {
  const directory = path.join(root, 'packages', name);
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  await mkdir(path.join(directory, 'dist'), { recursive: true });
  await build({ entryPoints: [path.join(directory, 'src/index.mjs')], outfile: path.join(directory, 'dist/index.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external' });
  const browser = await build({ entryPoints: [path.join(directory, 'src/client.jsx')], write: false, bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@deepseek-ai/*'], loader: { '.css': 'text', '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
  await writeFile(path.join(directory, 'dist/client.js'), `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{const module={exports:{}};const exports=module.exports;\n${browser.outputFiles[0].text}\nreturn module.exports;}});\n`);
  console.log(`Built ${pkg.name}`);
}
