// test/design-tokens.test.mjs
//
// Spec 6.1 says the design tokens are "consumed directly by the renderer."
// They are not: src/render/tokens.mjs is the only thing the renderer reads,
// and DESIGN.md's frontmatter is a hand-maintained transcription of it. Two
// copies of one set of semantics drift silently. This test makes them one
// fact by proving every value in DESIGN.md matches TOKENS.
//
// The parser below is deliberately purpose-built: this project has zero
// runtime dependencies and must not acquire a YAML package for a test. It
// reads exactly the shape DESIGN.md uses -- one level of `group:` headings
// over `key: "value"` lines -- and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOKENS } from '../src/render/tokens.mjs';

const DESIGN = readFileSync(fileURLToPath(new URL('../DESIGN.md', import.meta.url)), 'utf8');

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'DESIGN.md must open with a YAML frontmatter block');
  return match[1];
}

// `key:<any spacing>"value"` under a zero-indent `group:` heading.
function parseGroups(yaml) {
  const groups = new Map();
  let current = null;
  for (const raw of yaml.split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const heading = raw.match(/^([A-Za-z][\w-]*):\s*$/);
    if (heading) {
      current = new Map();
      groups.set(heading[1], current);
      continue;
    }
    const entry = raw.match(/^\s+([A-Za-z][\w-]*):\s*"(.*)"\s*$/);
    assert.ok(entry, `DESIGN.md frontmatter line is not a recognised token entry: ${raw}`);
    assert.ok(current, `token entry appears before any group heading: ${raw}`);
    current.set(entry[1], entry[2]);
  }
  return groups;
}

// DESIGN.md key -> the CSS custom property it must equal. Every entry in
// DESIGN.md must appear here, and every mapped property must exist in
// TOKENS, so neither file can grow a value the other has not seen.
const MAPPING = {
  color: (key) => `--vs-${key}`,
  type: (key) => ({
    display: '--vs-font-display',
    text: '--vs-font-text',
    mono: '--vs-font-mono',
  }[key] ?? `--vs-${key.replace(/^scale-/, '')}`),
  space: (key) => `--vs-${key}`,
  radius: (key) => (key === 'card' ? '--vs-radius' : `--vs-${key}`),
  motion: (key) => `--vs-${key}`,
};

const groups = parseGroups(frontmatter(DESIGN));

test('DESIGN.md declares every token group the renderer has', () => {
  assert.deepEqual([...groups.keys()].sort(),
    ['color', 'motion', 'radius', 'space', 'type'].sort());
});

test('every DESIGN.md token value matches src/render/tokens.mjs', () => {
  let compared = 0;
  for (const [group, entries] of groups) {
    const toProperty = MAPPING[group];
    assert.ok(toProperty, `DESIGN.md declares an unmapped token group: ${group}`);
    for (const [key, value] of entries) {
      const property = toProperty(key);
      assert.ok(property in TOKENS,
        `DESIGN.md ${group}.${key} maps to ${property}, which TOKENS does not define`);
      assert.equal(TOKENS[property], value,
        `DESIGN.md ${group}.${key} is ${JSON.stringify(value)} but ${property} is `
        + `${JSON.stringify(TOKENS[property])} — DESIGN.md and tokens.mjs have drifted`);
      compared += 1;
    }
  }
  // Falsification guard: an empty or mis-parsed frontmatter would make the
  // loop above pass without comparing anything.
  assert.ok(compared >= 25, `expected to compare every token, only compared ${compared}`);
});

test('every renderer token is documented in DESIGN.md', () => {
  const documented = new Set();
  for (const [group, entries] of groups) {
    for (const key of entries.keys()) documented.add(MAPPING[group](key));
  }
  const undocumented = Object.keys(TOKENS).filter((p) => !documented.has(p));
  assert.deepEqual(undocumented, [],
    'these tokens exist in tokens.mjs but are absent from DESIGN.md');
});
