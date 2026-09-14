import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimCard, claimFigures, formatValue } from '../src/render/claim-card.mjs';

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
  assumption: { statement: 'assumes steady case mix', owner: 'A. Reviewer' },
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
  assert.ok(html.includes('A. Reviewer'), 'the owner must be visible');
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
