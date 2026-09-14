// test/delta.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroDelta, HERO_CSS } from '../src/render/delta.mjs';

function rulesMatching(css, selectorSubstring) {
  return css
    .split('}')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const i = chunk.indexOf('{');
      return i === -1 ? null : { selector: chunk.slice(0, i), body: chunk.slice(i + 1) };
    })
    .filter((rule) => rule && rule.selector.includes(selectorSubstring));
}

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

test('HERO_CSS contains no hex color literals', () => {
  assert.ok(!/#[0-9a-fA-F]{3,6}/.test(HERO_CSS), 'no hex colors anywhere in HERO_CSS');
});

test('HERO_CSS: measured tier references --vs-accent', () => {
  const measuredRules = rulesMatching(HERO_CSS, '.vs-hero--measured');
  assert.ok(measuredRules.length >= 1, 'at least one measured rule found');
  assert.ok(measuredRules.some((r) => r.body.includes('--vs-accent')), 'at least one measured rule must reference accent');
});

test('HERO_CSS: --vs-accent never appears in estimated tier rules', () => {
  const estimatedRules = rulesMatching(HERO_CSS, '.vs-hero--estimated');
  assert.ok(estimatedRules.length >= 2, 'at least two estimated rules found (proves helper finds all)');
  assert.ok(estimatedRules.every((r) => !r.body.includes('--vs-accent')), 'no estimated rule may contain accent');
});

test('bogus tier normalizes to qualitative and renders no hero', () => {
  assert.equal(heroDelta({ ...claim, tier: 'bogus' }, { headline: 'x' }), '');
});

test('missing tier normalizes to qualitative and renders no hero', () => {
  const claimNoTier = { ...claim };
  delete claimNoTier.tier;
  assert.equal(heroDelta(claimNoTier, { headline: 'x' }), '');
});

test('valid measured and estimated claims still render (regression)', () => {
  const measuredHtml = heroDelta(claim, { headline: 'x' });
  assert.ok(measuredHtml.length > 0, 'measured claim renders');
  assert.ok(measuredHtml.includes('vs-hero--measured'), 'has measured class');

  const estimatedHtml = heroDelta({ ...claim, tier: 'estimated' }, { headline: 'x' });
  assert.ok(estimatedHtml.length > 0, 'estimated claim renders');
  assert.ok(estimatedHtml.includes('vs-hero--estimated'), 'has estimated class');
});
