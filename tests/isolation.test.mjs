// The root entry must run anywhere: only core, no React Native, Node or DOM.
// The build is parsed with TypeScript, so every import form counts and
// comments or strings do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const lib = resolve(dirname(fileURLToPath(import.meta.url)), '../lib');

const NODE_OR_DOM_GLOBALS = new Set([
  'Buffer',
  'process',
  'window',
  'document',
  'navigator',
  '__dirname',
  '__filename',
  'require',
  'module',
]);

/** Static specifiers, dynamic loads and Node/DOM globals in one module. */
export function scan(code, fileName = 'module.js') {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const specifiers = [];
  const dynamic = [];
  const globals = new Set();
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        dynamic.push(node.getText(source));
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        dynamic.push(node.getText(source));
      }
    } else if (ts.isIdentifier(node) && NODE_OR_DOM_GLOBALS.has(node.text)) {
      const parent = node.parent;
      const isMemberName =
        ts.isPropertyAccessExpression(parent) && parent.name === node;
      // `x.process` is not the global, but `globalThis.process` is.
      if (
        !isMemberName ||
        (ts.isIdentifier(parent.expression) &&
          parent.expression.text === 'globalThis')
      )
        globals.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { specifiers, dynamic, globals: [...globals] };
}

function closure(entry) {
  const files = new Set();
  const packages = new Set();
  const walk = (file) => {
    if (files.has(file)) return;
    files.add(file);
    const { specifiers, dynamic, globals } = scan(
      readFileSync(file, 'utf8'),
      file
    );
    const name = relative(lib, file);
    assert.deepEqual(dynamic, [], `${name} loads modules dynamically`);
    assert.deepEqual(globals, [], `${name} uses Node or DOM globals`);
    for (const spec of specifiers) {
      if (spec.startsWith('.')) walk(resolve(dirname(file), spec));
      else packages.add(spec);
    }
  };
  walk(resolve(lib, entry));
  return { files, packages };
}

test('the scanner sees every import form and ignores comments and strings', () => {
  const found = scan(`
    import "react-native";
    import a from 'a';
    import * as b from "b";
    import { c } from 'c';
    export { d } from "d";
    export * from 'e';
    import type_only from 'f';
    // import 'commented';
    /* import 'block-commented'; */
    const s = "import 'in-a-string'";
    const p = import('dynamic');
    const r = require('cjs');
    globalThis.process;
    Buffer.from('x');
    options.window;
  `);
  assert.deepEqual(found.specifiers, [
    'react-native',
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
  ]);
  assert.equal(found.dynamic.length, 2);
  assert.deepEqual(found.globals.sort(), ['Buffer', 'process', 'require']);
});

test('the root entry imports only @utexo/rgb-sdk-core', () => {
  const { packages } = closure('index.js');
  assert.deepEqual([...packages], ['@utexo/rgb-sdk-core']);
});

test('./webrgb adds only pure-JS packages and the optional @utexo/webrgb peer', () => {
  const { packages } = closure('webrgb/index.js');
  assert.deepEqual([...packages].sort(), [
    '@noble/hashes/sha2.js',
    '@noble/hashes/sha3.js',
    '@noble/hashes/utils.js',
    '@scure/base',
    '@utexo/rgb-sdk-core',
    '@utexo/webrgb',
  ]);
});
