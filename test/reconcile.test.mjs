import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { visibleFigures, reconcileDiagnostics } from '../src/reconcile.mjs';
import { renderCase } from '../src/render/render-case.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('extracts figures from rendered text only', () => {
  const figures = visibleFigures('<p data-x="99">72 <span>9</span></p>');
  assert.deepEqual(figures.sort(), ['72', '9'].sort());
});

test('ignores figures inside attributes', () => {
  assert.deepEqual(visibleFigures('<div data-claim="c1" id="ev-3"></div>'), []);
});

test('a faithfully rendered document reconciles', () => {
  const doc = good();
  assert.deepEqual(reconcileDiagnostics(doc, renderCase(doc)), []);
});

test('flags a figure on screen that no claim authorises', () => {
  const doc = good();
  const html = renderCase(doc).replace('>9<', '>4<');
  const d = reconcileDiagnostics(doc, html);
  assert.ok(d.some((x) => x.code === 'render/figure-untraced'));
});

test('the untraced diagnostic names the figure and lists authorised ones', () => {
  const doc = good();
  const html = renderCase(doc).replace('>9<', '>4<');
  const d = reconcileDiagnostics(doc, html).find((x) => x.code === 'render/figure-untraced');
  assert.equal(d.subject.figure, '4');
  assert.ok(Array.isArray(d.evidence.authorised));
});

test('a digit inside a unit label is not treated as an untraced figure', () => {
  const doc = good();
  doc.claims.push({
    id: 'c-unit',
    driver: 'productivity',
    metric: 'area cleared',
    unit: 'm2',
    tier: 'measured',
    direction: 'increase',
    baseline: { value: 10, asof: '2026-01' },
    current: { value: 20, asof: '2026-08' },
  });
  doc.arc.outcome.claim_refs.push('c-unit');
  assert.deepEqual(reconcileDiagnostics(doc, renderCase(doc)), []);
});

test('a numeral in a qualitative statement is flagged with qualitative-specific guidance', () => {
  const doc = good();
  doc.claims.push({
    id: 'c-qual',
    driver: 'governance-oversight',
    tier: 'qualitative',
    statement: 'defect rate reduced to 0 across all lines',
    evidence_ref: 'e4',
  });
  doc.arc.outcome.claim_refs.push('c-qual');
  const html = renderCase(doc);
  const d = reconcileDiagnostics(doc, html).find((x) => x.code === 'render/figure-untraced');
  assert.ok(d, 'expected the qualitative numeral to still be flagged');
  assert.equal(d.subject.figure, '0');
  assert.equal(d.subject.qualitative, true);
  assert.equal(d.subject.pointer, `/claims/${doc.claims.length - 1}/tier`);
  assert.match(d.message, /qualitative/i);
  assert.ok(d.supportedFixes.some((fix) => fix.includes(d.subject.pointer)));
  assert.ok(d.supportedFixes.some((fix) => /reword/i.test(fix)));
});

test('a claim/hero region that cannot be reliably bounded raises loudly instead of truncating silently', () => {
  const doc = good();
  const html = `<article class="vs-claim vs-claim--measured" data-claim="c1">
<p>outer 55</p>
<article class="nested">
<p>nested figure 999</p>
</article>
<p>after-nested 77</p>
</article>`;
  const d = reconcileDiagnostics(doc, html);
  assert.ok(d.some((x) => x.code === 'render/region-nested' && x.severity === 'error'));
});
