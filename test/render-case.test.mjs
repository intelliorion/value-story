// test/render-case.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCase } from '../src/render/render-case.mjs';
import { ARC_SLOTS, CHAPTERS_CSS } from '../src/render/chapters.mjs';

const doc = {
  schema_version: 1,
  meta: { title: 'Intake Triage', owner: 'J. Hao', period: '2026-08', motion: 'entry' },
  initiative: { id: 'int-01', name: 'Intake Triage', sponsor: 'S. Tzou', function: 'Ops', status: 'live' },
  drivers: { primary: 'labor-cost-efficiency', secondary: ['productivity'] },
  arc: {
    problem: { headline: 'Intake took three days', detail: 'Manual triage.', evidence_refs: ['e1'] },
    capability: { headline: 'Automated triage', detail: 'Classifies on arrival.', evidence_refs: ['e2'], novelty: 'first-of-kind' },
    outcome: { headline: 'Three days became one morning', claim_refs: ['c1', 'c2'] },
    significance: { headline: 'Capacity without headcount', detail: 'Scales at flat cost.' },
  },
  claims: [
    { id: 'c1', driver: 'labor-cost-efficiency', metric: 'case turnaround time', unit: 'hours',
      tier: 'measured', direction: 'decrease',
      baseline: { value: 72, asof: '2026-01', evidence_ref: 'e3' },
      current: { value: 9, asof: '2026-08', evidence_ref: 'e3' } },
    { id: 'c2', driver: 'productivity', tier: 'qualitative',
      statement: 'reviewers now see pre-sorted queues', evidence_ref: 'e4' },
  ],
  evidence: [
    { ref: 'e1', kind: 'doc', title: 'Ops review', date: '2026-01-15', locator: 'p2' },
    { ref: 'e2', kind: 'doc', title: 'Design note', date: '2026-03-02', locator: 'p1' },
    { ref: 'e3', kind: 'dataset', title: 'Triage timings', date: '2026-08-30', locator: 'triage_daily' },
    { ref: 'e4', kind: 'email', title: 'Reviewer feedback', date: '2026-08-12', locator: 'msg-88' },
  ],
};

test('all four arc slots render in order', () => {
  const html = renderCase(doc);
  const positions = ARC_SLOTS.map((s) => html.indexOf(`data-chapter="${s}"`));
  assert.ok(positions.every((p) => p >= 0), 'every slot must render');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'slots must be in order');
});

test('outcome renders referenced claims', () => {
  const html = renderCase(doc);
  assert.ok(html.includes('data-claim="c1"'));
  assert.ok(html.includes('data-claim="c2"'));
});

test('hero uses the first measured claim referenced by outcome', () => {
  const html = renderCase(doc);
  const hero = html.slice(html.indexOf('vs-hero'), html.indexOf('</section>'));
  assert.ok(hero.includes('72'));
  assert.ok(hero.includes('Three days became one morning'));
});

test('document is self-contained', () => {
  const html = renderCase(doc);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!/https?:\/\//.test(html));
  assert.ok(!/<script/.test(html), 'no javascript is needed');
});

test('evidence registry renders with every source', () => {
  const html = renderCase(doc);
  for (const e of doc.evidence) assert.ok(html.includes(e.title), `missing ${e.title}`);
});

test('a missing arc slot does not throw', () => {
  const partial = { ...doc, arc: { ...doc.arc, significance: undefined } };
  assert.doesNotThrow(() => renderCase(partial));
});

test('CHAPTERS_CSS contains no hex color literals', () => {
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(CHAPTERS_CSS), 'no hex colors anywhere in CHAPTERS_CSS');
});

test('composed stylesheet has no hex color literals outside the :root token block', () => {
  const html = renderCase(doc);
  const styleOpen = html.indexOf('<style>');
  const styleClose = html.indexOf('</style>');
  const styles = html.slice(styleOpen + '<style>'.length, styleClose);
  const rootEnd = styles.indexOf('}') + 1; // :root{...} is the first rule emitted
  assert.ok(styles.startsWith(':root{'), 'stylesheet must start with the :root token block');
  const afterRoot = styles.slice(rootEnd);
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(afterRoot),
    'no hex colors outside the :root token block');
});

// --- Fix 8: the outcome headline renders exactly once. ---

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('the outcome headline appears exactly once, in the hero', () => {
  const html = renderCase(doc);
  const headline = doc.arc.outcome.headline;
  assert.equal(occurrences(html, headline), 1,
    'the same sentence twice on one page is a visible rendering fault');
  assert.ok(html.includes(`<h1 class="vs-hero__headline">${headline}</h1>`),
    'the hero is the frame that must land first, so it carries the headline');
});

test('the outcome chapter keeps its eyebrow and its claim cards', () => {
  const html = renderCase(doc);
  const chapter = html.slice(html.indexOf('data-chapter="outcome"'));
  const end = chapter.indexOf('</section>');
  const outcome = chapter.slice(0, end);
  assert.ok(outcome.includes('What outcome changed'), 'the eyebrow must survive');
  assert.ok(outcome.includes('data-claim="c1"'), 'the claim cards must survive');
  assert.ok(!outcome.includes(doc.arc.outcome.headline),
    'the duplicate headline must be gone from the chapter');
});

test('the headline stays in the IR and still renders when there is no hero', () => {
  // No measured or estimated claim referenced by the outcome means no hero,
  // so the chapter must keep the headline rather than lose the sentence.
  const noHero = structuredClone(doc);
  noHero.arc.outcome.claim_refs = ['c2'];
  const html = renderCase(noHero);
  // vs-hero__headline also appears in the stylesheet, so look for the element.
  assert.ok(!html.includes('<h1 class="vs-hero__headline">'), 'this document has no hero');
  assert.equal(occurrences(html, noHero.arc.outcome.headline), 1,
    'the outcome headline must still render exactly once');
});
