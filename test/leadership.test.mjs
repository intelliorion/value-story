import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { leadership, leadershipAnswers, QUESTIONS } from '../src/render/leadership.mjs';
import { renderCase } from '../src/render/render-case.mjs';
import { validateCase } from '../src/validate.mjs';

const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/demo/${name}`, import.meta.url)), 'utf8'));
const doc = () => load('smart-building.value-case.json');

test('all five leadership questions are always present, answered or not', () => {
  const answers = leadershipAnswers({ claims: [], arc: {} });
  assert.equal(answers.length, 5);
  assert.ok(answers.every((a) => a.strength === 'unanswered'));
  const html = leadership({ claims: [], arc: {} });
  for (const q of QUESTIONS) assert.ok(html.includes(q.question), `${q.id} must appear`);
  assert.match(html, /0 of 5/);
});

// The point of the section is the questions it CANNOT answer. An unanswered
// question that quietly disappears would defeat it.
test('an unanswered question says so, and says what would answer it', () => {
  const html = leadership({ claims: [], arc: {} });
  assert.match(html, /Nothing in the evidence answers this/);
  for (const q of QUESTIONS) assert.ok(html.includes(q.missing), `${q.id} must name its missing evidence`);
});

test('a question is answered at the STRENGTH of its best claim, not its first', () => {
  const base = { arc: {}, claims: [
    { id: 'a', tier: 'qualitative', driver: 'productivity', statement: 'faster' },
    { id: 'b', tier: 'measured', driver: 'productivity', metric: 'm', unit: 'days', direction: 'decrease',
      baseline: { value: 9, asof: '2026-01' }, current: { value: 4, asof: '2026-06' } },
  ] };
  const productivity = leadershipAnswers(base).find((a) => a.question.id === 'productivity');
  assert.equal(productivity.strength, 'measured');
});

// Spec §4.8: reach is a claim SHAPE, not a driver. Both live under
// `productivity`, so the driver alone cannot separate them.
test('reach counts only claims whose unit names people or functions', () => {
  const withDays = { arc: {}, claims: [{ id: 'a', tier: 'measured', driver: 'productivity',
    metric: 'cycle time', unit: 'days', direction: 'decrease',
    baseline: { value: 9, asof: '2026-01' }, current: { value: 4, asof: '2026-06' } }] };
  const withPeople = { arc: {}, claims: [{ ...withDays.claims[0], unit: 'employees' }] };
  const reach = (d) => leadershipAnswers(d).find((a) => a.question.id === 'reach').strength;
  assert.equal(reach(withDays), 'unanswered', 'a cycle-time claim is not a reach answer');
  assert.equal(reach(withPeople), 'measured');
});

// REGRESSION. The rows print figures, so they must sit inside a region
// `src/reconcile.mjs` traces -- and their unit span must carry the class the
// reconciler strips, or a unit like "kWh/m2" is read as the figure 2.
test('every figure the panel prints is traced, and unit labels are not figures', () => {
  for (const name of ['smart-building.value-case.json', 'strong-measured.value-case.json',
    'mostly-estimated.value-case.json', 'qualitative-only.value-case.json']) {
    const result = validateCase(load(name));
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.diagnostics, null, 2)}`);
  }
  const html = leadership(doc());
  assert.match(html, /class="vs-claim vs-lq__row/, 'rows must be reconcilable regions');
  assert.match(html, /class="vs-claim__unit vs-lq__unit"/, 'the unit span must carry the class the reconciler strips');
});

// The artifact is forwarded more often than it is presented.
test('the section is interactive without script, and complete without CSS', () => {
  const html = renderCase(doc());
  assert.ok(!/<script/i.test(html), 'the artifact must carry no script');
  assert.equal((html.match(/class="vs-lq__panel"/g) || []).length, 5,
    'all five panels are in the DOM at all times, not fetched on demand');
  assert.equal((html.match(/type="radio" name="vs-lq"/g) || []).length, 5);
  assert.match(html, /@media print\{[\s\S]*\.vs-lq__panel\{display:block !important/,
    'print must open every panel');
});

test('exactly one panel opens on load, and it is one that has an answer', () => {
  const html = renderCase(doc());
  assert.equal((html.match(/ checked>/g) || []).length, 1);
  const openId = html.match(/id="vs-lq-([a-z]+)" class="vs-lq__radio" checked/)?.[1];
  const answer = leadershipAnswers(doc()).find((a) => a.question.id === openId);
  assert.ok(answer, `the checked radio ${openId} must be a known question`);
  assert.notEqual(answer.strength, 'unanswered', 'the page must not rest on an empty panel');
});
