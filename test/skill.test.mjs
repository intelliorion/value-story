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
  assert.ok(SKILL.includes('make **any** diagnostic pass is not a repair'));
  assert.ok(SKILL.includes('hides the same unsourced number under different words'));
});

test('requires the assumption owner to come from the source', () => {
  assert.ok(SKILL.includes('one the source actually names'));
});

test('requires reporting an unsourceable chapter instead of padding it', () => {
  assert.ok(SKILL.includes('rather than filling it with prose the evidence does not carry'));
});

test('states the numeral-tracing rule truthfully, including the conditional case', () => {
  // Each phrase must live on ONE line of SKILL.md, so the assertion cannot
  // be satisfied by text that happens to span a rewrap.
  const lines = SKILL.split('\n');
  const onOneLine = (phrase) => lines.some((l) => l.includes(phrase));

  assert.ok(onOneLine('Numerals are traced inside claim cards and the hero, and nowhere else.'));
  // arc.outcome.headline is rendered INTO the hero when the outcome
  // references a measured or estimated claim, so its status is conditional:
  // traced there, untraced when it falls back to its own chapter.
  assert.ok(onOneLine('traced **only when it reaches the hero**'));
  assert.ok(onOneLine('there is no hero, the headline falls back to its own chapter, and nothing checks it'));
  assert.ok(onOneLine('Never checked at all: the other chapter headlines and details, evidence titles, the initiative name.'));
  // The bullet ends on the instruction, not the mechanism.
  assert.ok(onOneLine('So put no figure in any headline or in prose.'));

  assert.ok(!SKILL.includes('does not check numerals written into chapter prose'),
    'the old exception-enumerating wording must be gone');
  assert.ok(!SKILL.includes('traces numerals **only** inside claim cards and the hero'),
    'the wording that called the outcome headline unconditionally untraced must be gone');
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
