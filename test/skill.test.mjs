// test/skill.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SKILL = readFileSync(fileURLToPath(new URL('../SKILL.md', import.meta.url)), 'utf8');

test('has skill frontmatter with name and description', () => {
  assert.ok(SKILL.startsWith('---\n'));
  assert.match(SKILL, /^name: value-story$/m);
  assert.match(SKILL, /^description: .{40,}$/m);
});

test('stays bounded', () => {
  assert.ok(SKILL.split('\n').length < 150, 'SKILL.md must stay under 150 lines');
});

test('names every prohibited repair', () => {
  for (const phrase of [
    'not a repair for a missing baseline',
    'not a repair for a failing driver',
    'Demoting the primary driver',
    'did not read',
  ]) {
    assert.ok(SKILL.includes(phrase), `missing prohibition: ${phrase}`);
  }
});

test('closes the reword-the-numeral loophole', () => {
  assert.ok(SKILL.includes('not a repair for `render/figure-untraced`'));
});

test('requires the assumption owner to come from the source', () => {
  assert.ok(SKILL.includes('one the source actually names'));
});

test('requires reporting an unsourceable chapter instead of padding it', () => {
  assert.ok(SKILL.includes('rather than filling it with prose the evidence does not carry'));
});

test('states the stop condition and the exit-code rule', () => {
  assert.ok(SKILL.includes('new minimum'));
  assert.ok(SKILL.includes('two consecutive rounds'));
  assert.ok(SKILL.includes('non-zero exit'));
});

test('keeps the three truth claims separate', () => {
  assert.ok(SKILL.includes('human judgment'));
});

test('the contract body is delimited for adapter generation', () => {
  assert.ok(SKILL.includes('<!-- contract:start -->'));
  assert.ok(SKILL.includes('<!-- contract:end -->'));
});
