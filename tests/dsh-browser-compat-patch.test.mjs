import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { patchIntrinsicConstructor, patchDshBrowserCompatibility } from '../scripts/dsh-browser-compat-patch.mjs';

const original = `function hasIntrinsicConstructor(prototype, name) {
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (typeof constructor !== "function") return false;
  try {
    return constructor.name === name && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === \`function \${name}() { [native code] }\`;
  } catch { return false; }
}`;

test('native constructor patch changes only the exact validation function and is idempotent', () => {
  const unrelated = 'const other = Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`;';
  const patched = patchIntrinsicConstructor(original + '\n' + unrelated);
  assert.match(patched, /\.replace\(\/\\s\+\/g, " "\)/);
  assert.ok(patched.endsWith(unrelated));
  assert.equal(patchIntrinsicConstructor(patched), patched);
  assert.throws(() => patchIntrinsicConstructor(original.replace('return false;', 'return true;')), /Unsupported/);
});

test('patch accepts V8 and WebKit formatting while rejecting non-native constructors', () => {
  const patched = patchIntrinsicConstructor(original);
  assert.equal(runInNewContext(patched + '\nhasIntrinsicConstructor(Object.prototype, "Object")'), true);
  const simulateJsc = `const nativeSource = Function.prototype.toString;
    Function.prototype.toString = function() { return nativeSource.call(this).replace(' { [native code] }', ' {\\n    [native code]\\n}'); };`;
  assert.equal(runInNewContext(simulateJsc + patched + '\nhasIntrinsicConstructor(Object.prototype, "Object")'), true);
  assert.equal(runInNewContext(simulateJsc + patched + '\nhasIntrinsicConstructor(Array.prototype, "Array")'), true);
  assert.equal(runInNewContext(patched + '\nfunction FakeObject() {}\nObject.defineProperty(FakeObject, "name", { value: "Object" });\nhasIntrinsicConstructor(FakeObject.prototype, "Object")'), false);
  assert.equal(runInNewContext(patched + '\nhasIntrinsicConstructor(Object.prototype, "Array")'), false);
});

test('DSH 0.2 native comparison is preserved and remains strict under WebKit formatting', () => {
  const modern = original.replace('=== `function ${name}() { [native code] }`', '=== Function.prototype.toString.call(name === "Array" ? Array : Object)');
  assert.notEqual(modern, original);
  assert.equal(patchIntrinsicConstructor(modern), modern);
  const simulateJsc = `const nativeSource = Function.prototype.toString;
    Function.prototype.toString = function() { return nativeSource.call(this).replace(' { [native code] }', ' {\\n    [native code]\\n}'); };`;
  for (const name of ['Object', 'Array']) assert.equal(runInNewContext(simulateJsc + modern + `\nhasIntrinsicConstructor(${name}.prototype, "${name}")`), true);
  assert.equal(runInNewContext(modern + '\nfunction FakeObject() {}\nObject.defineProperty(FakeObject, "name", { value: "Object" });\nhasIntrinsicConstructor(FakeObject.prototype, "Object")'), false);
  assert.throws(() => patchIntrinsicConstructor(modern.replace('Array : Object', 'Object : Array')), /Unsupported/);
});

test('startup patch validates syntax and leaves host and embedded sources unchanged', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'amadeus-browser-patch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const lib = path.join(root, 'node_modules/@deepseek-ai/mock/lib');
  await mkdir(lib, { recursive: true });
  const client = path.join(lib, 'client.js');
  const host = path.join(lib, 'host.js');
  await writeFile(client, original);
  await writeFile(host, original);
  const first = await patchDshBrowserCompatibility(root);
  assert.equal(first.changed, 1);
  assert.equal(await readFile(host, 'utf8'), original);
  assert.equal((await patchDshBrowserCompatibility(root)).changed, 0);
  await writeFile(client, original + '\nconst invalid = ;');
  await assert.rejects(patchDshBrowserCompatibility(root), /Refused invalid/);
  assert.equal(await readFile(client, 'utf8'), original + '\nconst invalid = ;');
  await writeFile(client, original.replace('return false;', 'return true;'));
  await assert.rejects(patchDshBrowserCompatibility(root), /Unsupported/);
});

test('installed DSH browser modules pass syntax validation and repeat patching is harmless', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const first = await patchDshBrowserCompatibility(root);
  assert.ok(first.functions > 0);
  const repeat = await patchDshBrowserCompatibility(root);
  assert.equal(repeat.changed, 0);
  assert.equal(repeat.functions, first.functions);
  const startup = await readFile(path.join(root, 'scripts/start.mjs'), 'utf8');
  assert.match(startup, /await patchDshBrowserCompatibility\(root\)/);
});
