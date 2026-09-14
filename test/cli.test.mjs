import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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
  try {
    execFileSync('node', [CLI, 'render', '/nope.json', '/tmp/x.html'], { stdio: 'pipe' });
    assert.fail('should have exited non-zero');
  } catch (error) {
    assert.notEqual(error.status, 0);
    const stderr = error.stderr.toString();
    assert.match(stderr, /input\/read|nope\.json|ENOENT/);
  }
});

test('render exits non-zero on malformed json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  try {
    execFileSync('node', [CLI, 'render', bad, join(dir, 'o.html')], { stdio: 'pipe' });
    assert.fail('should have exited non-zero');
  } catch (error) {
    assert.notEqual(error.status, 0);
    const stderr = error.stderr.toString();
    assert.match(stderr, /input\/json-parse/);
  }
});

test('rejects an unrecognised flag instead of treating it as a positional path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  try {
    execFileSync('node', [CLI, 'render', FIXTURE, '--output'], { stdio: 'pipe', cwd: dir });
    assert.fail('should have exited non-zero');
  } catch (error) {
    assert.notEqual(error.status, 0);
    const stderr = error.stderr.toString();
    assert.match(stderr, /unrecognised argument: --output/);
    // and it must not have written a file literally named --output
    assert.equal(existsSync(join(dir, '--output')), false);
  }
});

test('rejects a lone dash rather than treating it as a filename', () => {
  try {
    execFileSync('node', [CLI, 'render', '-'], { stdio: 'pipe' });
    assert.fail('should have exited non-zero');
  } catch (error) {
    assert.notEqual(error.status, 0);
    assert.match(error.stderr.toString(), /unrecognised argument: -$/m);
  }
});

test('rejects a bare double dash rather than treating it as a filename', () => {
  try {
    execFileSync('node', [CLI, 'render', '--', 'x.html'], { stdio: 'pipe' });
    assert.fail('should have exited non-zero');
  } catch (error) {
    assert.notEqual(error.status, 0);
    assert.match(error.stderr.toString(), /unrecognised argument: --$/m);
  }
});

test('rejects an unknown short flag', () => {
  try {
    execFileSync('node', [CLI, 'validate', FIXTURE, '-x'], { stdio: 'pipe' });
    assert.fail('should have exited non-zero');
  } catch (error) {
    assert.notEqual(error.status, 0);
    assert.match(error.stderr.toString(), /unrecognised argument: -x/);
  }
});

test('the fixture exercises all three claim tiers', () => {
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const tiers = new Set(doc.claims.map((c) => c.tier));
  assert.ok(tiers.has('measured'));
  assert.ok(tiers.has('estimated'));
  assert.ok(tiers.has('qualitative'));
});
