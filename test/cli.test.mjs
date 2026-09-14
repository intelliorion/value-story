import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));

test('render writes a self-contained artifact and exits zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const out = join(dir, 'a.html');
  execFileSync('node', [CLI, 'render', FIXTURE, out]);
  const html = readFileSync(out, 'utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!/https?:\/\//.test(html));
});

test('render exits non-zero on unreadable input', () => {
  assert.throws(() => execFileSync('node', [CLI, 'render', '/nope.json', '/tmp/x.html'],
    { stdio: 'pipe' }));
});

test('render exits non-zero on malformed json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  assert.throws(() => execFileSync('node', [CLI, 'render', bad, join(dir, 'o.html')],
    { stdio: 'pipe' }));
});

test('the fixture exercises all three claim tiers', () => {
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const tiers = new Set(doc.claims.map((c) => c.tier));
  assert.ok(tiers.has('measured'));
  assert.ok(tiers.has('estimated'));
  assert.ok(tiers.has('qualitative'));
});
