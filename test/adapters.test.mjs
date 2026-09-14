import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const ADAPTERS = ['.github/copilot-instructions.md', '.github/prompts/value-story.prompt.md',
  '.claude/skills/value-story/SKILL.md'];

// Regenerate into a scratch directory and compare, rather than regenerating
// in place. Regenerating in place would catch staleness exactly once and
// then overwrite the evidence -- the rerun would pass, and `npm test` would
// leave the working tree dirty.
test('adapters are in sync with SKILL.md and the generator is idempotent', () => {
  const out = mkdtempSync(join(tmpdir(), 'vs-adapters-'));
  try {
    execFileSync('node', ['scripts/generate-adapters.mjs'],
      { cwd: root, env: { ...process.env, VS_OUTPUT_ROOT: out } });
    for (const rel of ADAPTERS) {
      assert.equal(
        readFileSync(join(out, rel), 'utf8'),
        readFileSync(join(root, rel), 'utf8'),
        `${rel} is stale — run \`npm run build:adapters\` and commit the result`,
      );
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('copilot instructions carry the full contract', () => {
  const copilot = read('../.github/copilot-instructions.md');
  for (const phrase of [
    'not a repair for a missing baseline',
    'did not read',
    'non-zero exit',
  ]) {
    assert.ok(copilot.includes(phrase), `missing: ${phrase}`);
  }
  // Mode-agnostic: must show how to discover the CLI, in either the bare
  // `vs` form or the `node bin/vs.mjs` form the contract body actually
  // uses — so this still passes on the contract text alone, with no
  // dependency on any wrapper sentence the generator adds around it.
  assert.match(copilot, /(?:\bvs\b|node bin\/vs\.mjs) help --json/,
    'missing: a way to discover the CLI via `help --json`');
});

test('the copilot prompt file declares its mode', () => {
  const prompt = read('../.github/prompts/value-story.prompt.md');
  assert.match(prompt, /^---$/m);
  assert.match(prompt, /^mode: ['"]?agent['"]?$/m);
  assert.match(prompt, /^description: .+$/m);
});

test('generated files warn against hand editing', () => {
  for (const p of ['../.github/copilot-instructions.md', '../.github/prompts/value-story.prompt.md']) {
    assert.ok(read(p).includes('Generated from SKILL.md'), `${p} must say it is generated`);
  }
});

test('README documents installation for both harnesses', () => {
  const readme = read('../README.md');
  assert.ok(readme.includes('.claude/skills'));
  assert.ok(readme.includes('.github/copilot-instructions.md'));
  assert.match(readme, /(?:\bvs\b|node bin\/vs\.mjs) help --json/,
    'missing: a way to discover the CLI via `help --json`');
});
