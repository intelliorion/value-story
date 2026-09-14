// test/diagnostics.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizedDiagnostic, recordDiagnostic, collected, resetDiagnostics,
  withRecordingSuppressed, applySuppression, throwDiagnosticError, fallbackDiagnostic,
} from '../src/diagnostics.mjs';

beforeEach(() => resetDiagnostics());

test('normalizes an incomplete diagnostic into the full envelope', () => {
  const d = normalizedDiagnostic({ message: 'x' });
  assert.equal(d.code, 'internal/unclassified');
  assert.equal(d.severity, 'error');
  assert.deepEqual(d.subject, {});
  assert.deepEqual(d.evidence, {});
  assert.deepEqual(d.supportedFixes, []);
});

test('coerces unknown severity to error and keeps warning', () => {
  assert.equal(normalizedDiagnostic({ severity: 'nonsense' }).severity, 'error');
  assert.equal(normalizedDiagnostic({ severity: 'warning' }).severity, 'warning');
});

test('dedupes and trims supportedFixes', () => {
  const d = normalizedDiagnostic({ supportedFixes: [' a ', 'a', '', 'b'] });
  assert.deepEqual(d.supportedFixes, ['a', 'b']);
});

test('strips undefined values from subject', () => {
  assert.deepEqual(normalizedDiagnostic({ subject: { a: 1, b: undefined } }).subject, { a: 1 });
});

test('recording dedupes by message', () => {
  recordDiagnostic({ code: 'a/b', message: 'same' });
  recordDiagnostic({ code: 'c/d', message: 'same' });
  assert.equal(collected().length, 1);
});

test('suppressed recording discards diagnostics from speculative work', () => {
  withRecordingSuppressed(() => recordDiagnostic({ code: 'a/b', message: 'speculative' }));
  assert.equal(collected().length, 0);
  recordDiagnostic({ code: 'a/b', message: 'real' });
  assert.equal(collected().length, 1);
});

test('applySuppression removes codes named by a present root cause', () => {
  const out = applySuppression([
    normalizedDiagnostic({ code: 'driver/unknown', message: 'r',
      suppresses: ['claim/driver-undeclared'] }),
    normalizedDiagnostic({ code: 'claim/driver-undeclared', message: 'c' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'driver/unknown');
});

test('a suppressing diagnostic never suppresses itself', () => {
  const out = applySuppression([
    normalizedDiagnostic({ code: 'a/b', message: 'm', suppresses: ['a/b'] }),
  ]);
  assert.equal(out.length, 1);
});

test('mutual suppression (a suppresses b AND b suppresses a) preserves both', () => {
  const out = applySuppression([
    normalizedDiagnostic({ code: 'a', message: 'msg-a', suppresses: ['b'] }),
    normalizedDiagnostic({ code: 'b', message: 'msg-b', suppresses: ['a'] }),
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((d) => d.code).sort(), ['a', 'b']);
});

test('three-way cycle (a→b→c→a) returns all three via backstop', () => {
  const out = applySuppression([
    normalizedDiagnostic({ code: 'a', message: 'msg-a', suppresses: ['b'] }),
    normalizedDiagnostic({ code: 'b', message: 'msg-b', suppresses: ['c'] }),
    normalizedDiagnostic({ code: 'c', message: 'msg-c', suppresses: ['a'] }),
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((d) => d.code).sort(), ['a', 'b', 'c']);
});

test('normal acyclic suppression still works (root suppresses derived, only root survives)', () => {
  const out = applySuppression([
    normalizedDiagnostic({ code: 'root', message: 'msg-root', suppresses: ['derived'] }),
    normalizedDiagnostic({ code: 'derived', message: 'msg-derived' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'root');
});

test('resetDiagnostics inside withRecordingSuppressed does not corrupt depth', () => {
  withRecordingSuppressed(() => {
    resetDiagnostics();
    recordDiagnostic({ code: 'a/b', message: 'inside-suppressed' });
  });
  // resetDiagnostics sets depth to 0, so inside-suppressed gets recorded
  assert.equal(collected().length, 1);
  recordDiagnostic({ code: 'c/d', message: 'outside' });
  assert.equal(collected().length, 2);
  // After exiting and re-entering, depth should be properly restored
  withRecordingSuppressed(() => recordDiagnostic({ code: 'e/f', message: 'second-suppressed' }));
  // second-suppressed should be suppressed (not recorded)
  assert.equal(collected().length, 2);
});

test('throwDiagnosticError dedupes by message in error.vsDiagnostics', () => {
  let error;
  try {
    throwDiagnosticError('failed', [
      { code: 'a/b', message: 'dup' },
      { code: 'c/d', message: 'dup' },
      { code: 'e/f', message: 'unique' },
    ]);
  } catch (e) {
    error = e;
  }
  assert.equal(error.vsDiagnostics.length, 2);
  assert.deepEqual(error.vsDiagnostics.map((d) => d.message).sort(), ['dup', 'unique']);
});

test('fallbackDiagnostic for unclassified error has supportedFixes', () => {
  const d = fallbackDiagnostic(new Error('weird'), 'input.json');
  assert.equal(d.code, 'internal/unclassified');
  assert(Array.isArray(d.supportedFixes));
  assert(d.supportedFixes.length > 0);
  assert.equal(typeof d.supportedFixes[0], 'string');
});
