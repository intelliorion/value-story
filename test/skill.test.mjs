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

// ---------------------------------------------------------------------------
// Extraction guidance (M2).
//
// Every phrase below must live on ONE line of SKILL.md. A soft-wrapped
// sentence satisfies `SKILL.includes` while reading as two fragments, which is
// how an earlier round of this file passed with prose that had been split.
// ---------------------------------------------------------------------------

const LINES = SKILL.split('\n');
const onOneLine = (phrase) => LINES.some((l) => l.includes(phrase));

test('documents the ingest flow with commands that actually exist', () => {
  assert.ok(onOneLine('node bin/vs.mjs ingest <sources> --out <dir> --json'));
  assert.ok(onOneLine('node bin/vs.mjs validate <case.json> --manifest <dir>/evidence-manifest.json --json'));
  assert.ok(onOneLine('node bin/vs.mjs deliver  <case.json> <out.html> --manifest <dir>/evidence-manifest.json --json'));
});

test('gives a usable test for the measured/estimated boundary, not just a definition', () => {
  // The whole of M2 turns on this one decision.
  assert.ok(onOneLine('could someone re-run the query and get the same number?'));
  assert.ok(onOneLine('a deck, a status update, a proposal or an email with nothing behind it is `estimated`'));
});

test('names risk and reach as the two leadership questions that get missed', () => {
  assert.ok(onOneLine('Risk and reach are the two that get missed'));
  assert.ok(onOneLine('Report which of the five you could not answer'));
});

test('refuses to let a rubric score become a measured claim', () => {
  assert.ok(onOneLine('evidence of an ASSUMPTION, not of an outcome'));
  assert.ok(onOneLine('A rubric score is a prioritisation judgement, never a business result'));
});

test('states that an all-qualitative outcome is a correct outcome', () => {
  assert.ok(onOneLine('correct outcome, not a failure'));
  assert.ok(onOneLine('the tool rejects the manufactured number anyway'));
});

// ---------------------------------------------------------------------------
// The delivery contract (M3). The gate is only useful if the file that tells an
// agent how to use it also tells it which passes are counterfeit.
// ---------------------------------------------------------------------------

test('keeps the three claims apart, naming what each command proves', () => {
  assert.ok(onOneLine('`deliver` proves the deterministic artifact checks.'));
  assert.ok(onOneLine('`visual-check` proves bounded behaviour in a real browser.'));
  assert.ok(SKILL.includes('whether the artifact is any good remains a **human judgment**'));
  assert.ok(SKILL.includes('the tool never claims it'));
});

test('names the counterfeit passes explicitly', () => {
  for (const phrase of [
    'no `overflow:hidden`',
    'no clipped content',
    'no internal scroller',
    'no reduced typography',
  ]) {
    assert.ok(SKILL.includes(phrase), `missing counterfeit: ${phrase}`);
  }
  // The same argument the reword-the-numeral prohibition already makes.
  assert.ok(SKILL.includes('makes the measurement pass while making the artifact worse'));
});

test('documents the gate command and its graduated repair bands', () => {
  assert.ok(onOneLine('node bin/vs.mjs visual-check <out.html> --json'));
  assert.ok(SKILL.includes('do not remove content'));
  assert.ok(SKILL.includes('do not shrink the hero numeral'));
  assert.ok(SKILL.includes('report it rather than compressing'));
});

test('sends a contrast repair to the token file, not to the element', () => {
  assert.ok(SKILL.includes('src/render/tokens.mjs'));
  assert.ok(SKILL.includes('not a per-element override'));
});

// ---------------------------------------------------------------------------
// Who each gate is addressed to (M2/M3 final fix wave).
//
// `visual-check` fails on the tool's own artifacts over a palette defect whose
// only repair points at `src/render/tokens.mjs` -- a file this contract
// forbids the authoring agent to read. That made the documented happy path
// unpassable and its only repair prohibited. The resolution is not to change
// the palette but to say honestly whose finding a `layout/*` finding is.
// ---------------------------------------------------------------------------

test('separates the author\'s gate on the document from the maintainer\'s gate on the rendering', () => {
  assert.ok(SKILL.includes("`validate` and `deliver` are the AUTHOR's gate on the document."));
  assert.ok(SKILL.includes("`visual-check` is a MAINTAINER's gate on the rendering"));
});

test('forbids the authoring agent from repairing a layout finding or bending the case around one', () => {
  assert.ok(onOneLine('A `layout/*` finding names a CSS selector and a file under `src/render/`, which you are forbidden to read or edit.'));
  assert.ok(SKILL.includes('**It is not yours to'));
  assert.ok(SKILL.includes('repair, and it is never a reason to alter the value case.**'));
  assert.ok(SKILL.includes('report'));
  assert.ok(SKILL.includes('the findings verbatim as a renderer defect'));
});

test('scopes the JSON-Pointer promise to document-level diagnostics', () => {
  assert.ok(SKILL.includes('For a document-level diagnostic'));
  assert.ok(SKILL.includes('each fix names a JSON Pointer into your document'));
  assert.ok(SKILL.includes('`layout/*` is the exception and is not yours'));
});

test('tells the agent to verify a warned source against the original before quoting it', () => {
  assert.ok(onOneLine('a warned source must be verified against the original before its text is quoted'));
  assert.ok(SKILL.includes('evidence/source-warning'));
});

test('states that every capability is reachable from the command line', () => {
  assert.ok(onOneLine('Every capability is reachable from the command line; nothing depends on a particular agent harness.'));
});

test('still points a contrast repair at the token file, and says whose edit it is', () => {
  assert.ok(SKILL.includes("Both are the maintainer's edits, not the author's."));
});
