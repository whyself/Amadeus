import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installBrowserRuntime } from './browser-bootstrap.mjs';

const options = process.argv.slice(2);
if (options.some(option => !['--deps-only', '--with-deps'].includes(option)) || (options.includes('--deps-only') && options.includes('--with-deps'))) {
  throw new Error('Usage: npm run setup:browsers -- [--deps-only | --with-deps]');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await installBrowserRuntime(root, { dependenciesOnly: options.includes('--deps-only'), withDependencies: options.includes('--with-deps') });
