import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import validate from '../generated/validate-value-case.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('the fixture validates', () => {
  assert.equal(validate(good()), true, JSON.stringify(validate.errors, null, 2));
});

test('rejects a driver outside the closed enumeration', () => {
  const doc = good();
  doc.drivers.primary = 'cost-savings';
  assert.equal(validate(doc), false);
});

test('rejects a missing arc slot', () => {
  const doc = good();
  delete doc.arc.significance;
  assert.equal(validate(doc), false);
});

test('rejects a free-text field on the outcome chapter', () => {
  const doc = good();
  doc.arc.outcome.detail = 'we cut 40 hours';
  assert.equal(validate(doc), false, 'outcome must not accept free text');
});

test('rejects a measured claim without a baseline', () => {
  const doc = good();
  delete doc.claims[0].baseline;
  assert.equal(validate(doc), false);
});

test('rejects an estimated claim without an assumption owner', () => {
  const doc = good();
  delete doc.claims[1].assumption.owner;
  assert.equal(validate(doc), false);
});

test('rejects numeric fields on a qualitative claim', () => {
  const doc = good();
  doc.claims[2].baseline = { value: 1, asof: '2026-01' };
  assert.equal(validate(doc), false);
});

test('rejects a malformed date', () => {
  const doc = good();
  doc.claims[0].baseline.asof = 'Jan 2026';
  assert.equal(validate(doc), false);
});
