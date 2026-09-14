// test/constellation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constellation } from '../src/render/constellation.mjs';
import { ALL_DRIVERS } from '../src/drivers.mjs';

const sel = { primary: 'labor-cost-efficiency', secondary: ['productivity'] };

test('every driver appears, including unclaimed ones', () => {
  const svg = constellation(sel);
  for (const id of ALL_DRIVERS) {
    assert.ok(svg.includes(`data-driver="${id}"`), `missing ${id}`);
  }
});

test('exactly one driver is primary', () => {
  const svg = constellation(sel);
  assert.equal((svg.match(/data-state="primary"/g) || []).length, 1);
});

test('secondary and dark states are distinguished', () => {
  const svg = constellation(sel);
  assert.equal((svg.match(/data-state="secondary"/g) || []).length, 1);
  assert.equal((svg.match(/data-state="dark"/g) || []).length, 8);
});

test('renders inline svg with no external references', () => {
  const svg = constellation(sel);
  assert.ok(svg.includes('<svg'));
  assert.ok(!/https?:\/\//.test(svg));
});

test('tolerates a missing secondary list', () => {
  const svg = constellation({ primary: 'productivity' });
  assert.equal((svg.match(/data-state="dark"/g) || []).length, 9);
});
