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
