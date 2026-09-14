import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the generator is idempotent and adapters are in sync with SKILL.md', () => {
  const before = [
    read('../.github/copilot-instructions.md'),
    read('../.github/prompts/value-story.prompt.md'),
  ];
  execFileSync('node', ['scripts/generate-adapters.mjs'], { cwd: root });
  const after = [
    read('../.github/copilot-instructions.md'),
    read('../.github/prompts/value-story.prompt.md'),
  ];
  assert.deepEqual(after, before,
    'adapters are stale — run `npm run build:adapters` and commit the result');
});

test('copilot instructions carry the full contract', () => {
  const copilot = read('../.github/copilot-instructions.md');
  for (const phrase of [
    'not a repair for a missing baseline',
    'did not read',
    'non-zero exit',
    'vs help --json',
  ]) {
    assert.ok(copilot.includes(phrase), `missing: ${phrase}`);
  }
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
  assert.ok(readme.includes('vs help --json'));
});
