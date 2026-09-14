// test/diagnostics.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizedDiagnostic, recordDiagnostic, collected, resetDiagnostics,
  withRecordingSuppressed, applySuppression,
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
