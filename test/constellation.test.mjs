// test/constellation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constellation, CONSTELLATION_CSS } from '../src/render/constellation.mjs';
import { ALL_DRIVERS, DRIVER_GROUPS } from '../src/drivers.mjs';

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

test('viewBox height accommodates the longer column without clipping', () => {
  const svg = constellation(sel);
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(viewBoxMatch, 'viewBox found');
  const viewBoxHeight = parseInt(viewBoxMatch[2], 10);

  // The longer column is the max of effectiveness and efficiency lengths
  const longerColumnLength = Math.max(DRIVER_GROUPS.effectiveness.length, DRIVER_GROUPS.efficiency.length);
  // Y-coordinate of the last row in the longer column
  const PAD = 16;
  const ROW_H = 46;
  const lastRowY = PAD + 42 + (longerColumnLength - 1) * ROW_H;

  // The viewBox height must be greater than the y-coordinate of the last row
  assert.ok(viewBoxHeight > lastRowY, `viewBox height ${viewBoxHeight} must be greater than last row y-coordinate ${lastRowY}`);
});

test('CONSTELLATION_CSS contains no hex color literals', () => {
  const hexPattern = /#[0-9a-fA-F]{3,6}/;
  assert.equal(hexPattern.test(CONSTELLATION_CSS), false,
    'CSS must not contain hex color literals like #fff or #123456');
});

test('CONSTELLATION_CSS: primary state references --vs-accent', () => {
  const primaryRules = rulesMatching(CONSTELLATION_CSS, '[data-state="primary"]');
  assert.ok(primaryRules.length >= 1, 'at least one primary state rule found');
  assert.ok(primaryRules.some((r) => r.body.includes('--vs-accent')), 'at least one primary rule must reference accent');
});

test('CONSTELLATION_CSS: dark state maintains visibility (not hidden or opacity:0)', () => {
  const darkRules = rulesMatching(CONSTELLATION_CSS, '[data-state="dark"]');
  assert.ok(darkRules.length >= 1, 'at least one dark state rule found');
  assert.ok(darkRules.every((r) => !r.body.includes('display:none') && !/opacity:\s*0(?:[;}]|\s)/.test(r.body)),
    'no dark rule may set display:none or opacity:0; dark drivers must remain perceivable');
});
