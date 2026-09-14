import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCase } from '../src/validate.mjs';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('the fixture passes every gate', () => {
  const result = validateCase(good());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
});

test('schema and semantic diagnostics arrive in one receipt', () => {
  const doc = good();
  doc.claims[0].driver = 'differentiation';
  const result = validateCase(doc);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 'claim/driver-undeclared'));
});

test('schema failures surface as named domain codes, not generic ones', () => {
  const missingSlot = good();
  delete missingSlot.arc.significance;
  assert.ok(validateCase(missingSlot).diagnostics.some((d) => d.code === 'arc/slot-missing'));

  const noOwner = good();
  delete noOwner.claims[1].assumption.owner;
  const d = validateCase(noOwner).diagnostics.find((x) => x.code === 'claim/estimated-no-owner');
  assert.ok(d, 'missing assumption owner must use its named code');
  assert.match(d.subject.pointer, /\/claims\/1\/assumption\/owner$/);

  const inlineNumber = good();
  inlineNumber.arc.outcome.detail = 'we cut 40 hours';
  assert.ok(validateCase(inlineNumber).diagnostics
    .some((x) => x.code === 'arc/outcome-inline-number'));
});

test('a parse failure yields exactly one diagnostic', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  let stderr = '';
  try {
    execFileSync('node', [CLI, 'validate', bad, '--json'], { stdio: 'pipe' });
    assert.fail('should have exited non-zero');
  } catch (error) {
    stderr = error.stderr.toString();
  }
  const receipt = JSON.parse(stderr);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.diagnostics.length, 1);
  assert.equal(receipt.diagnostics[0].code, 'input/json-parse');
});

test('deliver writes the artifact and reports both hashes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const out = join(dir, 'a.html');
  const receipt = JSON.parse(execFileSync('node', [CLI, 'deliver', FIXTURE, out, '--json']).toString());
  assert.equal(receipt.ok, true);
  assert.match(receipt.specSha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.artifactSha256, /^[0-9a-f]{64}$/);
  assert.ok(existsSync(out));
});

test('a failed delivery preserves the previous artifact and leaves no temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const out = join(dir, 'a.html');
  execFileSync('node', [CLI, 'deliver', FIXTURE, out]);
  const kept = readFileSync(out, 'utf8');

  const broken = join(dir, 'broken.json');
  const doc = good();
  doc.drivers.primary = 'not-a-driver';
  writeFileSync(broken, JSON.stringify(doc));

  assert.throws(() => execFileSync('node', [CLI, 'deliver', broken, out], { stdio: 'pipe' }));
  assert.equal(readFileSync(out, 'utf8'), kept, 'previous artifact must survive');
  assert.equal(existsSync(`${out}.candidate`), false, 'no temp file may remain');
});

test('help --json describes every command for any harness', () => {
  const help = JSON.parse(execFileSync('node', [CLI, 'help', '--json']).toString());
  assert.equal(help.name, 'value-story');
  const names = help.commands.map((c) => c.name);
  for (const c of ['render', 'validate', 'deliver', 'schema', 'help']) {
    assert.ok(names.includes(c), `help must document ${c}`);
  }
});

test('schema prints the value-case schema as json', () => {
  const schema = JSON.parse(execFileSync('node', [CLI, 'schema']).toString());
  assert.equal(schema.type, 'object');
  assert.ok(schema.properties.claims);
});

// --- Fix 4: an OUTPUT failure is an output diagnostic, never an input one. ---

function deliverFailure(inputPath, outputPath) {
  try {
    execFileSync('node', [CLI, 'deliver', inputPath, outputPath, '--json'], { stdio: 'pipe' });
    assert.fail('deliver should have exited non-zero');
  } catch (error) {
    assert.notEqual(error.status, 0);
    return JSON.parse(error.stderr.toString());
  }
}

test('an unwritable output directory yields an output/write diagnostic, not input/read', () => {
  const out = join(tmpdir(), 'vs-definitely-not-a-directory-9f3a', 'out.html');
  const receipt = deliverFailure(FIXTURE, out);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.diagnostics.length, 1);
  const [d] = receipt.diagnostics;
  assert.equal(d.code, 'output/write', 'an output fault must not be reported as an input fault');
  assert.equal(d.subject.output, out, 'the diagnostic must carry the real output path');
  assert.notDeepEqual(d.subject, {}, 'spec §5 forbids an empty subject');
  assert.ok(d.message.includes(out), 'the message must name the output destination');
  assert.ok(d.supportedFixes.length > 0);
  assert.ok(d.supportedFixes.some((f) => /writable/i.test(f)),
    'the fix must point at the output path, not the input file');
  assert.ok(!d.supportedFixes.some((f) => /input/i.test(f)),
    'the fix must not send the agent back to the input file');
});

test('the internal .candidate suffix never leaks into a diagnostic', () => {
  const out = join(tmpdir(), 'vs-definitely-not-a-directory-9f3a', 'out.html');
  const receipt = deliverFailure(FIXTURE, out);
  const text = JSON.stringify(receipt);
  assert.ok(!text.includes('.candidate'),
    'the temp file is an implementation detail and names nothing the agent wrote');
});

test('a read-only output directory is also an output/write diagnostic', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-ro-'));
  chmodSync(dir, 0o500);
  try {
    const receipt = deliverFailure(FIXTURE, join(dir, 'out.html'));
    assert.equal(receipt.diagnostics[0].code, 'output/write');
  } finally {
    chmodSync(dir, 0o700);
  }
});

// --- Fix 1, end to end: a measured claim with no citation is REJECTED. ---

test('deliver rejects a measured claim carrying no evidence_ref', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const doc = good();
  delete doc.claims[0].baseline.evidence_ref;
  delete doc.claims[0].current.evidence_ref;
  const input = join(dir, 'uncited.json');
  writeFileSync(input, JSON.stringify(doc));
  const out = join(dir, 'a.html');

  const receipt = deliverFailure(input, out);
  assert.ok(receipt.diagnostics.some((d) => d.code === 'claim/measured-no-evidence'),
    'a measured claim with no citation must not reach an artifact');
  assert.equal(existsSync(out), false, 'no artifact may be written for a rejected document');
});
