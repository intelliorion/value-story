/**
 * The zero-dependency guarantee, asserted instead of remembered.
 *
 * This project's central promise is that the renderer, validator and CLI run
 * with an EMPTY node_modules. It has been hand-verified many times and, until
 * this file, never once tested — and hand-verification does not survive the two
 * ways the promise actually breaks:
 *
 *   1. `npm install --save-dev <anything>` SILENTLY DELETES an empty
 *      `"dependencies": {}` block from package.json. Observed twice while
 *      adding Playwright in Task 20. Nothing announces it.
 *   2. A bare `import 'lodash'` lands in `src/` and nobody updates
 *      package.json. `dependencies` is still `{}`, the manifest still looks
 *      perfect, and the guarantee is already broken.
 *
 * (2) is the one that matters more, and the manifest check alone would miss it
 * entirely. So both are checked here.
 *
 * No browser, no network, no I/O beyond reading source text. This must keep
 * running when Playwright is absent, because that is exactly the situation the
 * guarantee describes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// `src/` and `bin/` ONLY, deliberately.
//
// `scripts/` is excluded because it is build-time tooling that is ALLOWED to
// use devDependencies: `scripts/generate-validators.mjs` statically imports
// `ajv` to generate the standalone validator, which is the whole point of that
// script. Including `scripts/` would flag that legitimate import, and a test
// that must be taught to ignore a real match is a test people learn to ignore.
//
// `scripts/visual-check.mjs` is the interesting case and it is safe either way:
// it reaches Playwright through `await import('playwright')`, which is DYNAMIC
// and deliberately so. The matcher below does not match dynamic `import()` at
// all — asserted, not assumed, in the last test in this file.
const SCANNED_DIRS = ['src', 'bin'];

function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(mjs|js)$/.test(entry.name)) found.push(path);
  }
  return found;
}

/** A specifier this project is allowed to reach for with no node_modules. */
const isAllowed = (specifier) =>
  specifier.startsWith('node:')
  || specifier.startsWith('./')
  || specifier.startsWith('../')
  || specifier.startsWith('/');

/**
 * Finds STATIC module specifiers. Every pattern here requires whitespace or a
 * quote directly after the keyword, so `import(` — dynamic import — cannot
 * match any of them.
 *
 * The whitespace between `from` and the specifier is `\s*`, which includes
 * NEWLINES, and the patterns are run over the whole file rather than line by
 * line. A statement split across lines —
 *
 *     import x from
 *       'some-package';
 *
 * — is legal, is what a formatter with a narrow print width will produce, and
 * slips straight past a line-at-a-time scan. It does not occur in this tree
 * today; that is not a reason to leave the hole open.
 */
const STATIC_FORMS = [
  // import x from 'y' / import {a} from 'y' / import * as z from 'y' /
  // export {a} from 'y' / export * from 'y' — specifier may sit on a later line
  /(?:^|[;\s])(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g,
  // import 'y'  — side-effect only
  /(?:^|[;\s])import\s+['"]([^'"]+)['"]/g,
  // require('y')
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Blanks whole-line comments while PRESERVING line count and offsets, so the
 * patterns can run across the whole file and a match still maps back to its
 * real line.
 *
 * Comment LINES are blanked rather than comments stripped from the whole file:
 * a block-comment strip can swallow a regex literal or a `//` inside a string
 * such as 'file://', and silently stop scanning real code.
 */
function blankCommentLines(source) {
  return source.split('\n').map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return ' '.repeat(line.length);
    }
    return line;
  }).join('\n');
}

/**
 * @returns {Array<{line: number, specifier: string, text: string}>} every
 *   static specifier in `source`, with the line it sits on so a failure names
 *   a place rather than a fact.
 */
function staticSpecifiers(source) {
  const scanned = blankCommentLines(source);
  const lines = source.split('\n');
  const found = [];
  for (const pattern of STATIC_FORMS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(scanned)) !== null) {
      // The KEYWORD's line, not the match start's: the leading `[;\s]` the
      // patterns consume may itself be the newline that ends the line before,
      // which would report the statement one line early. And the statement may
      // end several lines further down, so the end is no use either.
      const head = match[0].search(/import|export|require/);
      const start = match.index + (head < 0 ? 0 : head);
      const line = scanned.slice(0, start).split('\n').length;
      found.push({ line, specifier: match[1], text: (lines[line - 1] || '').trim() });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

test('package.json declares dependencies, and declares it empty', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  // The key must EXIST. The failure mode actually observed is deletion, not
  // mutation: `npm install --save-dev` drops an empty block on the floor, and
  // a missing `dependencies` is not the same statement as an empty one — it is
  // the absence of the statement.
  assert.ok('dependencies' in pkg,
    'package.json has no "dependencies" key. npm deletes an empty one on install; '
    + 'restore `"dependencies": {}` — the empty object is the promise, not an accident.');

  assert.deepEqual(pkg.dependencies, {},
    'this project has no runtime dependencies and must keep none; '
    + 'anything needed at build or check time belongs in devDependencies.');
});

test('nothing in src/ or bin/ statically imports a package', () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir)));

  // A walk that quietly finds nothing would make this whole test a green light
  // that measures air.
  assert.ok(files.length >= 10, `expected to scan real source, found ${files.length} file(s)`);

  const violations = [];
  for (const file of files) {
    for (const found of staticSpecifiers(readFileSync(file, 'utf8'))) {
      if (!isAllowed(found.specifier)) {
        violations.push(`${file.slice(ROOT.length)}:${found.line}  ${found.specifier}\n    ${found.text}`);
      }
    }
  }

  assert.deepEqual(violations, [],
    `these break the empty-node_modules guarantee:\n${violations.join('\n')}\n\n`
    + 'src/ and bin/ may import only `node:*` and local files. If something genuinely '
    + 'needs a package, reach it through a DYNAMIC `await import()` behind a clear '
    + 'failure message, the way scripts/visual-check.mjs reaches Playwright.');
});

test('the matcher catches bare imports and leaves dynamic import() alone', () => {
  // The instrument, checked against known inputs. Without this, the test above
  // would pass just as happily with a matcher that matches nothing at all —
  // and a test that cannot fail is worse than no test.
  const caught = (source) => staticSpecifiers(source).map((f) => f.specifier);

  assert.deepEqual(caught("import lodash from 'lodash';"), ['lodash']);
  assert.deepEqual(caught('import { chromium } from "playwright";'), ['playwright']);
  assert.deepEqual(caught("import * as x from 'left-pad';"), ['left-pad']);
  assert.deepEqual(caught("import 'side-effect-pkg';"), ['side-effect-pkg']);
  assert.deepEqual(caught("export { a } from 'some-pkg';"), ['some-pkg']);
  assert.deepEqual(caught("const x = require('express');"), ['express']);

  // Split across lines. Legal, and a formatter with a narrow print width will
  // write it. A line-at-a-time scan never sees it.
  assert.deepEqual(caught("import x from\n  'some-package';"), ['some-package']);
  assert.deepEqual(caught("import {\n  chromium,\n} from 'playwright';"), ['playwright']);
  assert.deepEqual(caught("export {\n  a,\n} from\n  'some-pkg';"), ['some-pkg']);

  // …and the line reported is the keyword's line, not the specifier's, so the
  // failure message points at the statement.
  assert.deepEqual(
    staticSpecifiers("const a = 1;\nimport x from\n  'some-package';").map((f) => f.line),
    [2],
  );

  // …and every one of those is correctly judged a violation.
  for (const specifier of ['lodash', 'playwright', 'ajv/dist/2020.js']) {
    assert.equal(isAllowed(specifier), false, `${specifier} should not be allowed`);
  }

  // Dynamic import is the sanctioned escape hatch and must never be flagged.
  assert.deepEqual(caught("const { chromium } = await import('playwright');"), []);
  assert.deepEqual(caught("const m = await import('playwright');"), []);
  assert.deepEqual(caught("return import('playwright');"), []);
  assert.deepEqual(caught("const m = await import(\n  'playwright',\n);"), []);

  // Comment lines are still not scanned, and blanking them must not shift the
  // line numbers of the code around them.
  assert.deepEqual(caught("// import x from 'lodash';"), []);
  assert.deepEqual(caught(" * import x from 'lodash';"), []);
  assert.deepEqual(
    staticSpecifiers("// import x from 'lodash';\nimport y from 'node:fs';").map((f) => f.line),
    [2],
  );

  // What real src/ code looks like: allowed, and recognised as such.
  assert.deepEqual(caught("import { readFileSync } from 'node:fs';"), ['node:fs']);
  assert.deepEqual(caught("import { renderCase } from '../src/render/render-case.mjs';"), ['../src/render/render-case.mjs']);
  for (const specifier of ['node:fs', './x.mjs', '../src/render/render-case.mjs']) {
    assert.equal(isAllowed(specifier), true, `${specifier} should be allowed`);
  }
});
