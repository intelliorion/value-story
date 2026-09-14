// test/delta.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroDelta, HERO_CSS } from '../src/render/delta.mjs';

const claim = {
  id: 'c1', metric: 'case turnaround time', unit: 'hours',
  tier: 'measured', direction: 'decrease',
  baseline: { value: 72, asof: '2026-01' },
  current: { value: 9, asof: '2026-08' },
};

test('hero renders baseline and current', () => {
  const html = heroDelta(claim, { headline: 'Three days became one morning' });
  assert.ok(html.includes('72'));
  assert.ok(html.includes('9'));
  assert.ok(html.includes('Three days became one morning'));
  assert.ok(html.includes('hours'));
});

test('hero marks its tier so estimates are never styled as measured', () => {
  assert.ok(heroDelta(claim, { headline: 'x' }).includes('vs-hero--measured'));
  assert.ok(heroDelta({ ...claim, tier: 'estimated' }, { headline: 'x' })
    .includes('vs-hero--estimated'));
});

test('hero returns empty string when there is no numeric claim', () => {
  assert.equal(heroDelta(null, { headline: 'x' }), '');
  assert.equal(heroDelta({ tier: 'qualitative', statement: 's' }, { headline: 'x' }), '');
});

test('motion is honoured once and respects reduced-motion', () => {
  assert.ok(HERO_CSS.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(HERO_CSS.includes('forwards'), 'entry animation must resolve and hold');
  assert.ok(!/infinite/.test(HERO_CSS), 'nothing may loop');
});

test('print path carries no animation', () => {
  assert.ok(HERO_CSS.includes('@media print'));
});
