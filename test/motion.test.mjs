import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderCase } from '../src/render/render-case.mjs';
import { MOTION_CSS, MOTION_OFF_CSS, motionProfile, motionDiagnostics } from '../src/render/motion.mjs';
import { validateCase } from '../src/validate.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/demo/smart-building.value-case.json', import.meta.url));
const doc = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const asStatic = (d) => ({ ...d, meta: { ...d.meta, motion: 'static' } });
const count = (html, re) => (html.match(re) || []).length;

test('the default profile is entry, and an absent field does not mean static', () => {
  assert.equal(motionProfile(doc()), 'entry');
  assert.equal(motionProfile({}), 'entry');
  assert.equal(motionProfile({ meta: {} }), 'entry');
  assert.equal(motionProfile(asStatic(doc())), 'static');
});

// Spec §6.3: every animation runs once on entry and resolves. A looping effect
// would also hang `visual-check`, which waits for document.getAnimations().
test('nothing loops, pulses or bounces', () => {
  assert.ok(!/infinite/.test(MOTION_CSS), 'no animation may repeat');
  assert.ok(!/alternate/.test(MOTION_CSS), 'no animation may reverse');
  assert.ok(!/animation-iteration-count\s*:\s*(?!1\b)/.test(MOTION_CSS));
  // `animation:none` is a disable, not an entry animation; only real ones
  // are required to hold their end state.
  const declarations = [...MOTION_CSS.matchAll(/animation:[^;}]*/g)]
    .map((m) => m[0]).filter((d) => !/animation:\s*none/.test(d));
  assert.ok(declarations.length >= 4, 'the components that carry the argument must animate');
  for (const d of declarations) {
    assert.ok(/\bboth\b/.test(d), `entry animation must hold its end state: ${d}`);
  }
});

// Every delay plus duration must land inside the gate's 2000ms settle budget,
// or `visual-check` measures a page that is still moving.
test('every animation resolves inside the gate settle budget', () => {
  const multipliers = [...MOTION_CSS.matchAll(/var\(--vs-stagger\)\s*\*\s*([\d.]+)/g)]
    .map((m) => Number(m[1]));
  const extras = [...MOTION_CSS.matchAll(/\+\s*(\d+)ms/g)].map((m) => Number(m[1]));
  const worst = Math.max(...multipliers) * 70 + Math.max(0, ...extras) + 820;
  assert.ok(worst < 2000, `worst-case animation resolves at ${worst}ms, past the 2000ms budget`);
});

test('both exits from motion are universal, so they cover every stylesheet', () => {
  for (const guard of ['@media (prefers-reduced-motion: reduce)', '@media print']) {
    assert.ok(MOTION_CSS.includes(guard), `${guard} must switch motion off`);
  }
  const blocks = MOTION_CSS.split(/@media/).slice(1);
  for (const block of blocks) {
    assert.ok(/\*,\*::before,\*::after\{animation:none !important/.test(block),
      'the exit must be universal, not a list of selectors that can fall behind');
  }
});

test('a static profile renders an artifact that cannot animate', () => {
  const html = renderCase(asStatic(doc()));
  assert.ok(html.includes('--vs-motion:static'));
  assert.ok(!html.includes('--vs-motion:entry'), 'a static artifact must not also carry the entry sheet');
  assert.equal(count(html, /@keyframes vs-rise-in/g), 0, 'the entry sheet must be omitted, not merely overridden');
  assert.ok(/\*,\*::before,\*::after\{animation:none !important/.test(html),
    'whatever any other stylesheet declared must still be disabled');
});

test('an entry profile actually animates the components that carry the argument', () => {
  const html = renderCase(doc());
  assert.ok(html.includes('--vs-motion:entry'));
  for (const selector of ['.vs-chapter{animation', '.vs-claim{animation', '.vs-node{animation',
    '.vs-claim__to{', '.vs-node circle{']) {
    assert.ok(html.includes(selector), `${selector} must carry entry motion`);
  }
});

// The diagnostic exists so the static promise is VERIFIED, not asserted. It can
// only fire on a renderer defect, so the test drives it with a regressed render
// rather than with a document an author could write.
test('motion/budget-exceeded fires when a static profile still animates', () => {
  const regressed = renderCase(doc());
  const found = motionDiagnostics(asStatic(doc()), regressed);
  assert.equal(found.length, 1);
  assert.equal(found[0].code, 'motion/budget-exceeded');
  assert.equal(found[0].severity, 'error');
  assert.match(found[0].supportedFixes.join(' '), /renderer defect/,
    'it is not the author\'s to repair, and the fix must say so');
  assert.equal(motionDiagnostics(asStatic(doc()), renderCase(asStatic(doc()))).length, 0);
  assert.equal(motionDiagnostics(doc(), regressed).length, 0, 'an entry profile is not a budget breach');
});

test('a static value case still validates and still delivers', () => {
  const result = validateCase(asStatic(doc()));
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
});

test('MOTION_OFF_CSS names no component, so it cannot fall behind the renderer', () => {
  assert.ok(!/vs-claim|vs-node|vs-chapter|vs-hero/.test(MOTION_OFF_CSS));
});
