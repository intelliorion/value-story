import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));

// A non-zero exit with empty stderr is indistinguishable, to an agent
// harness reading only stderr, from a silent crash -- so every failure path
// must be non-zero, write something to stderr, and write nothing to stdout.
function assertFailure(args, stderrPattern, options = {}) {
  try {
    execFileSync('node', [CLI, ...args], { stdio: 'pipe', ...options });
    assert.fail(`expected non-zero exit for: vs ${args.join(' ')}`);
  } catch (error) {
    assert.notEqual(error.status, 0, `expected non-zero exit for: vs ${args.join(' ')}`);
    const stderr = error.stderr.toString();
    const stdout = error.stdout.toString();
    assert.notEqual(stderr.length, 0, `expected non-empty stderr for: vs ${args.join(' ')}`);
    assert.equal(stdout.length, 0, `expected empty stdout for: vs ${args.join(' ')}, got: ${stdout}`);
    if (stderrPattern) assert.match(stderr, stderrPattern);
    return { status: error.status, stderr, stdout };
  }
}

function assertHelpSuccess(args) {
  const stdout = execFileSync('node', [CLI, ...args], { stdio: 'pipe' });
  return stdout.toString();
}

test('render writes a self-contained artifact and exits zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const out = join(dir, 'a.html');
  execFileSync('node', [CLI, 'render', FIXTURE, out]);
  const html = readFileSync(out, 'utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!/https?:\/\//.test(html));
});

test('render exits non-zero on unreadable input, stderr non-empty, stdout empty', () => {
  assertFailure(['render', '/nope.json', '/tmp/x.html'], /input\/read|nope\.json|ENOENT/);
});

test('render exits non-zero on malformed json, stderr non-empty, stdout empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  assertFailure(['render', bad, join(dir, 'o.html')], /input\/json-parse/);
});

test('validate exits non-zero on a schema-invalid document, stderr non-empty, stdout empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  delete doc.claims[1].assumption.owner;
  const bad = join(dir, 'noowner.json');
  writeFileSync(bad, JSON.stringify(doc));
  assertFailure(['validate', bad], /claim\/estimated-no-owner/);
});

test('rejects an unrecognised flag instead of treating it as a positional path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  assertFailure(['render', FIXTURE, '--output'], /unrecognised argument: --output/, { cwd: dir });
  // and it must not have written a file literally named --output
  assert.equal(existsSync(join(dir, '--output')), false);
});

test('rejects a lone dash rather than treating it as a filename', () => {
  assertFailure(['render', '-'], /unrecognised argument: -$/m);
});

test('rejects a bare double dash rather than treating it as a filename', () => {
  assertFailure(['render', '--', 'x.html'], /unrecognised argument: --$/m);
});

test('rejects an unknown short flag', () => {
  assertFailure(['validate', FIXTURE, '-x'], /unrecognised argument: -x/);
});

test('rejects an unknown command, stderr non-empty, stdout empty', () => {
  assertFailure(['frobnicate', 'x', 'y'], /unknown or incomplete command/);
});

test('rejects a missing positional argument, stderr non-empty, stdout empty', () => {
  assertFailure(['render'], /unknown or incomplete command/);
  assertFailure(['deliver', FIXTURE], /unknown or incomplete command/);
});

test('vs help exits zero, writes to stdout, and writes nothing to stderr', () => {
  const result = spawnSync('node', [CLI, 'help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.length > 0);
  assert.equal(result.stderr.length, 0);
});

test('bare vs (no arguments) exits zero and is treated as a help request', () => {
  const out = assertHelpSuccess([]);
  assert.match(out, /vs help/);
});

test('vs help --json exits zero and emits valid JSON on stdout describing every command', () => {
  const out = assertHelpSuccess(['help', '--json']);
  const help = JSON.parse(out);
  assert.equal(help.name, 'value-story');
  const names = help.commands.map((c) => c.name);
  for (const c of ['render', 'validate', 'deliver', 'schema', 'help']) {
    assert.ok(names.includes(c));
  }
});

test('the fixture exercises all three claim tiers', () => {
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const tiers = new Set(doc.claims.map((c) => c.tier));
  assert.ok(tiers.has('measured'));
  assert.ok(tiers.has('estimated'));
  assert.ok(tiers.has('qualitative'));
});
