import { readFile, writeFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ORIGINAL = 'Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`';
const COMPATIBLE = 'Function.prototype.toString.call(constructor).replace(/\\s+/g, " ") === `function ${name}() { [native code] }`';
const FUNCTION = /function hasIntrinsicConstructor\(prototype, name\) \{\s*const constructor = Object\.getOwnPropertyDescriptor\(prototype, "constructor"\)\?\.value;\s*if \(typeof constructor !== "function"\) return false;\s*try \{\s*return constructor\.name === name && constructor\.prototype === prototype && (?:Function\.prototype\.toString\.call\(constructor\)(?:\.replace\(\/\\s\+\/g, " "\))? === `function \$\{name\}\(\) \{ \[native code\] \}`|Function\.prototype\.toString\.call\(constructor\) === Function\.prototype\.toString\.call\(name === "Array" \? Array : Object\));\s*\} catch \{\s*return false;\s*\}\s*\}/g;

// Match the complete known validation function, never native-looking tails in
// arbitrary code or embedded worker strings. DSH 0.2 compares against the local
// native constructor directly and already supports Safari, so leave it intact.
// Unknown dependency builds fail
// before writes, rather than silently weakening object validation.
export function patchIntrinsicConstructor(source) {
  const matches = [...source.matchAll(FUNCTION)];
  const declarations = source.match(/function hasIntrinsicConstructor\(/g) || [];
  if (declarations.length !== matches.length) throw new Error('Unsupported DSH browser build: hasIntrinsicConstructor changed');
  return source.replace(FUNCTION, match => match.replace(ORIGINAL, COMPATIBLE));
}

async function clientModules(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await clientModules(target, files);
    else if (entry.isFile() && path.basename(directory) === 'lib' && /^client[^/\\]*\.js$/.test(entry.name)) files.push(target);
  }
  return files;
}

export async function patchDshBrowserCompatibility(root) {
  const base = path.join(root, 'node_modules/@deepseek-ai');
  const pending = [];
  let functions = 0;
  for (const file of await clientModules(base)) {
    const before = await readFile(file, 'utf8');
    if (!before.includes('function hasIntrinsicConstructor(')) continue;
    const after = patchIntrinsicConstructor(before);
    functions += [...after.matchAll(FUNCTION)].length;
    if (after === before) continue;
    const checked = spawnSync(process.execPath, ['--check', '--input-type=module'], {
      input: after, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    });
    if (checked.status !== 0) throw new Error(`Refused invalid DSH browser patch: ${file}: ${checked.stderr || checked.error || 'syntax check failed'}`);
    pending.push({ file, after });
  }
  if (!functions) throw new Error('Unsupported DSH browser build: no intrinsic-constructor checks found');
  // Validate every candidate before changing any dependency file.
  for (const { file, after } of pending) await writeFile(file, after);
  return { changed: pending.length, functions };
}
