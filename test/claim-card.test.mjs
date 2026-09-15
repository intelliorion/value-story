import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimCard, claimFigures, formatValue, CLAIM_CARD_CSS } from '../src/render/claim-card.mjs';

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

const measured = {
  id: 'c1', driver: 'labor-cost-efficiency', metric: 'case turnaround time',
  unit: 'hours', tier: 'measured', direction: 'decrease',
  baseline: { value: 72, asof: '2026-01', evidence_ref: 'e3' },
  current: { value: 9, asof: '2026-08', evidence_ref: 'e3' },
};

const estimated = {
  id: 'c2', driver: 'productivity', metric: 'reviewer capacity',
  unit: 'cases/week', tier: 'estimated', direction: 'increase',
  baseline: { value: 40, asof: '2026-01' },
  current: { value: 55, asof: '2026-08' },
  assumption: { statement: 'assumes steady case mix', owner: 'Review Team Lead' },
};

const qualitative = {
  id: 'c3', driver: 'governance-oversight', tier: 'qualitative',
  statement: 'every decision now carries an auditable rationale trail',
  evidence_ref: 'e5',
};

test('formatValue groups thousands and trims trailing zeros', () => {
  assert.equal(formatValue(72), '72');
  assert.equal(formatValue(1200), '1,200');
  assert.equal(formatValue(12.50), '12.5');
  assert.equal(formatValue(0.125), '0.13');
});

test('measured claims carry the measured class and cite evidence', () => {
  const html = claimCard(measured);
  assert.ok(html.includes('vs-claim--measured'));
  assert.ok(html.includes('data-evidence="e3"'));
  assert.ok(html.includes('72'));
  assert.ok(html.includes('9'));
});

test('estimated claims are marked and name the owner', () => {
  const html = claimCard(estimated);
  assert.ok(html.includes('vs-claim--estimated'));
  assert.ok(html.includes('Review Team Lead'), 'the owner must be visible');
  assert.ok(html.includes('assumes steady case mix'));
  assert.ok(!html.includes('vs-claim--measured'));
});

test('qualitative claims render no numerals at all', () => {
  const html = claimCard(qualitative);
  assert.ok(html.includes('vs-claim--qualitative'));
  assert.ok(html.includes('auditable rationale trail'));
  assert.equal(/\d/.test(html.replace(/data-[a-z]+="[^"]*"/g, '')), false,
    'qualitative cards must contain no digits in visible content');
});

test('claimFigures authorises exactly the numerals a claim renders', () => {
  assert.deepEqual(claimFigures(measured).sort(), ['72', '9'].sort());
  assert.deepEqual(claimFigures(estimated).sort(), ['40', '55'].sort());
  assert.deepEqual(claimFigures(qualitative), []);
});

test('claim content is escaped', () => {
  const html = claimCard({ ...qualitative, statement: '<img onerror=x>' });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});

test('formatValue handles null without fabricating zero', () => {
  assert.equal(formatValue(null), '');
  assert.equal(formatValue(undefined), '');
  assert.equal(formatValue(0), '0');
  assert.equal(formatValue(NaN), '');
});

test('formatValue handles very large values without precision loss', () => {
  // toFixed avoids overflow on values past MAX_SAFE_INTEGER
  assert.equal(formatValue(999999999999.99), '999,999,999,999.99');
  assert.equal(formatValue(1234567890.12), '1,234,567,890.12');
  assert.equal(formatValue(1000000), '1,000,000');
});

test('qualitative claim with baseline and current renders no numerals', () => {
  const malformed = {
    id: 'c4', tier: 'qualitative',
    statement: 'this claim is malformed with numbers',
    baseline: { value: 100 },
    current: { value: 200 },
  };
  const html = claimCard(malformed);
  assert.ok(html.includes('vs-claim--qualitative'));
  assert.equal(/\d/.test(html.replace(/data-[a-z]+="[^"]*"/g, '')), false,
    'qualitative cards must contain no digits even when baseline/current exist');
  assert.deepEqual(claimFigures(malformed), [],
    'claimFigures must return empty for qualitative even with baseline/current');
});

test('CLAIM_CARD_CSS contains no hex color literals', () => {
  const hexPattern = /#[0-9a-fA-F]{3,6}/;
  assert.equal(hexPattern.test(CLAIM_CARD_CSS), false,
    'CSS must not contain hex color literals like #fff or #123456');
});

test('CLAIM_CARD_CSS: measured tier references --vs-accent', () => {
  const measuredRules = rulesMatching(CLAIM_CARD_CSS, '.vs-claim--measured');
  assert.ok(measuredRules.length >= 1, 'at least one measured rule found');
  assert.ok(measuredRules.some((r) => r.body.includes('--vs-accent')), 'at least one measured rule must reference accent');
});

test('CLAIM_CARD_CSS: estimated tier never references --vs-accent', () => {
  const estimatedRules = rulesMatching(CLAIM_CARD_CSS, '.vs-claim--estimated');
  assert.ok(estimatedRules.length >= 1, 'at least one estimated rule found (proves helper finds rules)');
  assert.ok(estimatedRules.every((r) => !r.body.includes('--vs-accent')), 'no estimated rule may contain accent');
});

test('bogus tier normalizes to qualitative', () => {
  const bogus = {
    id: 'c5', tier: 'bogus',
    statement: 'unknown tier becomes qualitative',
    baseline: { value: 5 },
    current: { value: 6 },
  };
  const html = claimCard(bogus);
  assert.ok(html.includes('vs-claim--qualitative'));
  assert.equal(/\d/.test(html.replace(/data-[a-z]+="[^"]*"/g, '')), false);
  assert.deepEqual(claimFigures(bogus), []);
});
