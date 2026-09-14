import Ajv from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Schemas are always read from the repository; only the DESTINATION is
// overridable, so a drift test can regenerate into a scratch directory and
// compare without mutating the working tree.
const outRoot = process.env.VS_OUTPUT_ROOT || root;
const read = (name) => JSON.parse(readFileSync(join(root, 'schemas', name), 'utf8'));

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  code: { source: true, esm: true },
  schemas: [read('common.schema.json')],
});

const validate = ajv.compile(read('value-case.schema.json'));

// Ajv's standalone codegen references two tiny internal runtime helpers
// (used by minLength/maxLength unicode counting and by enum/const/uniqueItems
// deep-equality) via `require("ajv/dist/runtime/...")`, even with
// `code: { esm: true }`. That is both invalid syntax in an ESM file and,
// even if rewritten to an import, a runtime dependency on node_modules —
// which this project must not have. Inline the two helpers' source in
// place of the require() calls so the generated module is fully
// self-contained. Sources are reproduced verbatim from
// ajv/dist/runtime/ucs2length.js and fast-deep-equal (ajv/dist/runtime/equal.js's
// implementation), matching Ajv's own runtime behavior exactly.
const UCS2LENGTH_INLINE = `
/*
 * ucs2length() below is copied verbatim from the "ajv" package, version 8.20.0
 * (source: ajv/dist/runtime/ucs2length.js).
 * Copyright (c) 2015-2021 Evgeny Poberezkin. Licensed under the MIT License.
 * See THIRD_PARTY_NOTICES.md at the repository root for the full license text.
 */
(function ucs2length(str) {
    const len = str.length;
    let length = 0;
    let pos = 0;
    let value;
    while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 0xd800 && value <= 0xdbff && pos < len) {
            // high surrogate, and there is a next character
            value = str.charCodeAt(pos);
            if ((value & 0xfc00) === 0xdc00) pos++; // low surrogate
        }
    }
    return length;
})`;
const EQUAL_INLINE = `
/*
 * equal() below is copied verbatim from the "fast-deep-equal" package,
 * version 3.1.3 (source: fast-deep-equal/index.js) — the implementation that
 * ajv/dist/runtime/equal.js re-exports.
 * Copyright (c) 2017 Evgeny Poberezkin. Licensed under the MIT License.
 * See THIRD_PARTY_NOTICES.md at the repository root for the full license text.
 */
(function equal(a, b) {
    if (a === b) return true;
    if (a && b && typeof a == 'object' && typeof b == 'object') {
        if (a.constructor !== b.constructor) return false;
        let length, i, keys;
        if (Array.isArray(a)) {
            length = a.length;
            if (length != b.length) return false;
            for (i = length; i-- !== 0; ) if (!equal(a[i], b[i])) return false;
            return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; ) if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
            const key = keys[i];
            if (!equal(a[key], b[key])) return false;
        }
        return true;
    }
    return a !== a && b !== b;
})`;

let code = standaloneCode(ajv, validate);
const before = code;
code = code
  .replaceAll('require("ajv/dist/runtime/ucs2length").default', UCS2LENGTH_INLINE)
  .replaceAll('require("ajv/dist/runtime/equal").default', EQUAL_INLINE);
if (code.includes('require(')) {
  throw new Error(
    'generate-validators: generated code still contains require() after inlining known runtime helpers — ' +
      'inspect the output for a new Ajv runtime dependency before shipping.'
  );
}
if (code === before) {
  console.warn(
    'generate-validators: no known Ajv runtime helpers (ucs2length, equal) needed inlining this run — ' +
      'verify whether a newer Ajv version changed what its standalone codegen emits.'
  );
}

mkdirSync(join(outRoot, 'generated'), { recursive: true });
writeFileSync(join(outRoot, 'generated', 'validate-value-case.mjs'), code);
process.stdout.write('generated/validate-value-case.mjs\n');
