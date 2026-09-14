// test/manifest.test.mjs
//
// The rule under test is one sentence: YOU CANNOT CITE WHAT YOU DID NOT READ.
//
// The manifest is the record of what was actually ingested. These tests pin
// down the two ways that record can be violated -- a citation naming a source
// absent from the manifest, and a manifest whose recorded hash no longer
// matches the bytes on disk -- and, just as importantly, the ways it must NOT
// fire: no manifest at all, and a manifest listing more than the case cites.
//
// The most dangerous failure mode is a NEAR match silently passing. A title
// that differs only in case or spacing is a candidate for the agent to choose
// from, never an automatic resolution.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readManifest, manifestDiagnostics } from '../src/manifest.mjs';
import { validateCase } from '../src/validate.mjs';
import { deliverCase } from '../src/deliver.mjs';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function tmp() {
  return mkdtempSync(join(tmpdir(), 'vs-manifest-'));
}

/**
 * Write a real file for every evidence title in `doc` and return a manifest
 * that honestly describes them. Titles can be overridden per index so a test
 * can make exactly one citation dangle.
 */
function manifestFor(dir, doc, { titles = null, extra = [] } = {}) {
  const documents = doc.evidence.map((e, i) => {
    const title = titles && titles[i] !== undefined ? titles[i] : e.title;
    const path = join(dir, `source-${i}.txt`);
    const body = `contents of ${title}\n`;
    writeFileSync(path, body, 'utf8');
    return {
      path,
      title,
      kind: e.kind,
      sha256: sha256(Buffer.from(body, 'utf8')),
      bytes: Buffer.byteLength(body),
      ingested_at: '2026-09-14T09:00:00Z',
    };
  });
  for (const [n, title] of extra.entries()) {
    const path = join(dir, `extra-${n}.txt`);
    const body = `contents of ${title}\n`;
    writeFileSync(path, body, 'utf8');
    documents.push({
      path,
      title,
      kind: 'doc',
      sha256: sha256(Buffer.from(body, 'utf8')),
      bytes: Buffer.byteLength(body),
      ingested_at: '2026-09-14T09:00:00Z',
    });
  }
  return { schema_version: 1, documents };
}

function writeManifest(dir, manifest) {
  const path = join(dir, 'evidence-manifest.json');
  writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf8');
  return path;
}

function runFailure(args) {
  try {
    execFileSync('node', [CLI, ...args], { stdio: 'pipe' });
    assert.fail(`expected non-zero exit for: vs ${args.join(' ')}`);
  } catch (error) {
    assert.notEqual(error.status, 0);
    const stdout = error.stdout.toString();
    assert.equal(stdout.length, 0, `expected empty stdout, got: ${stdout}`);
    const stderr = error.stderr.toString();
    assert.notEqual(stderr.length, 0, 'expected non-empty stderr');
    return { stderr, status: error.status };
  }
}

// ---------------------------------------------------------------- opt-in ---

test('with NO manifest, evidence/not-in-manifest never fires', () => {
  const result = validateCase(good());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  assert.ok(!result.diagnostics.some((d) => d.code === 'evidence/not-in-manifest'));
});

test('a hand-authored case with no manifest still delivers, and says so honestly', () => {
  const dir = tmp();
  try {
    const receipt = deliverCase(good(), join(dir, 'out.html'));
    assert.equal(receipt.ok, true, JSON.stringify(receipt.diagnostics, null, 2));
    assert.equal(receipt.citationsVerified, false,
      'without a manifest the receipt must not claim citations were verified');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------ resolution ---

test('every evidence title present in the manifest is clean', () => {
  const dir = tmp();
  try {
    const doc = good();
    const manifest = manifestFor(dir, doc);
    assert.deepEqual(manifestDiagnostics(doc, manifest), []);
    const result = validateCase(doc, { manifest });
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a manifest listing documents the case does not cite is fine', () => {
  const dir = tmp();
  try {
    const doc = good();
    const manifest = manifestFor(dir, doc, {
      extra: ['Unused board deck', 'Unused finance model', 'Unused interview notes'],
    });
    assert.deepEqual(manifestDiagnostics(doc, manifest), [],
      'reading more than you cite is normal and must not warn');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a citation absent from the manifest fires with the offending pointer', () => {
  const dir = tmp();
  try {
    const doc = good();
    const manifest = manifestFor(dir, doc, { titles: { 2: 'Some other document entirely' } });
    const diagnostics = manifestDiagnostics(doc, manifest);
    const d = diagnostics.find((x) => x.code === 'evidence/not-in-manifest');
    assert.ok(d, `expected evidence/not-in-manifest, got ${JSON.stringify(diagnostics)}`);
    assert.equal(d.severity, 'error');
    assert.equal(d.subject.pointer, '/evidence/2/title');
    assert.ok(d.supportedFixes.some((f) => f.includes('/evidence/2/title')),
      `supportedFixes must name the pointer, got ${JSON.stringify(d.supportedFixes)}`);
    assert.equal(diagnostics.length, 1, 'only the dangling citation is reported');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the diagnostic carries the closest manifest titles so the repair is mechanical', () => {
  const dir = tmp();
  try {
    const doc = good();
    // The manifest holds "Triage timings"; the case cites "Triage timings"
    // at index 2. Replace the manifest entry with a close-but-different title.
    const manifest = manifestFor(dir, doc, { titles: { 2: 'Triage timings export' } });
    const d = manifestDiagnostics(doc, manifest).find((x) => x.code === 'evidence/not-in-manifest');
    assert.ok(d);
    const candidates = d.evidence.candidates;
    assert.ok(Array.isArray(candidates) && candidates.length > 0, 'candidates must be listed');
    assert.ok(candidates.length <= 3, 'at most three candidates');
    assert.equal(candidates[0], 'Triage timings export',
      'the closest manifest title must be offered first');
    for (const c of candidates) {
      assert.ok(manifest.documents.some((m) => m.title === c),
        'every candidate must be a real manifest title');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a NEAR match is reported, never silently accepted', () => {
  const dir = tmp();
  try {
    const doc = good();
    // Same words; different case and spacing. This is exactly the shape of
    // near-miss that must not be auto-resolved into a pass.
    const manifest = manifestFor(dir, doc, { titles: { 0: '  operations   REVIEW ' } });
    const diagnostics = manifestDiagnostics(doc, manifest);
    const d = diagnostics.find((x) => x.code === 'evidence/not-in-manifest');
    assert.ok(d, 'a near match must still fire; matching is exact, candidates are advisory');
    assert.equal(d.subject.pointer, '/evidence/0/title');
    assert.ok(d.evidence.candidates.includes('  operations   REVIEW '),
      'the near match must be offered as a candidate');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------- stale ---

test('a cited file whose bytes changed since ingest fires evidence/manifest-stale', () => {
  const dir = tmp();
  try {
    const doc = good();
    const manifest = manifestFor(dir, doc);
    const target = manifest.documents[1];
    writeFileSync(target.path, 'the document has been edited since it was read\n', 'utf8');

    const diagnostics = manifestDiagnostics(doc, manifest);
    const d = diagnostics.find((x) => x.code === 'evidence/manifest-stale');
    assert.ok(d, `expected evidence/manifest-stale, got ${JSON.stringify(diagnostics)}`);
    assert.equal(d.severity, 'error');
    assert.equal(d.subject.pointer, '/evidence/1');
    assert.equal(d.evidence.recordedSha256, target.sha256);
    assert.notEqual(d.evidence.actualSha256, target.sha256);
    assert.equal(validateCase(doc, { manifest }).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unchanged corpus is stale-clean even when uncited documents change', () => {
  const dir = tmp();
  try {
    const doc = good();
    const manifest = manifestFor(dir, doc, { extra: ['Unused board deck'] });
    const unused = manifest.documents[manifest.documents.length - 1];
    writeFileSync(unused.path, 'edited, but nothing cites it\n', 'utf8');
    assert.deepEqual(manifestDiagnostics(doc, manifest), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a cited file that has moved or been deleted is a WARNING, not a hard failure', () => {
  const dir = tmp();
  try {
    const doc = good();
    const manifest = manifestFor(dir, doc);
    rmSync(manifest.documents[3].path, { force: true });

    const diagnostics = manifestDiagnostics(doc, manifest);
    const d = diagnostics.find((x) => x.code === 'evidence/manifest-stale');
    assert.ok(d, 'a vanished source must still be reported');
    assert.equal(d.severity, 'warning',
      'deleting the file afterwards does not un-read the document');
    assert.equal(d.evidence.condition, 'file-missing');
    assert.equal(validateCase(doc, { manifest }).ok, true,
      'a warning must not block delivery');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------- readManifest ---

test('readManifest returns the parsed manifest', () => {
  const dir = tmp();
  try {
    const doc = good();
    const path = writeManifest(dir, manifestFor(dir, doc));
    const manifest = readManifest(path);
    assert.equal(manifest.documents.length, doc.evidence.length);
    assert.equal(manifest.documents[0].title, doc.evidence[0].title);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a malformed manifest produces a diagnostic, not a crash', () => {
  const dir = tmp();
  try {
    const path = join(dir, 'broken.json');
    writeFileSync(path, '{ documents: [', 'utf8');
    assert.throws(() => readManifest(path), (error) => {
      assert.ok(Array.isArray(error.vsDiagnostics), 'the error must carry diagnostics');
      assert.equal(error.vsDiagnostics[0].code, 'input/json-parse');
      assert.ok(error.vsDiagnostics[0].supportedFixes.length > 0);
      return true;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a manifest that parses but violates the manifest schema produces a diagnostic', () => {
  const dir = tmp();
  try {
    const path = writeManifest(dir, {
      schema_version: 1,
      documents: [{
        path: 'a.txt', title: 'A', kind: 'doc', sha256: 'not-a-hash',
        bytes: 1, ingested_at: '2026-09-14T09:00:00Z',
      }],
    });
    assert.throws(() => readManifest(path), (error) => {
      assert.ok(Array.isArray(error.vsDiagnostics) && error.vsDiagnostics.length > 0);
      assert.ok(error.vsDiagnostics.every((d) => typeof d.message === 'string' && d.message.length > 0));
      assert.ok(error.vsDiagnostics.some((d) => /sha256/.test(JSON.stringify(d))),
        'the diagnostic must name what is wrong');
      return true;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable manifest path produces input/read, not a stack trace', () => {
  assert.throws(() => readManifest('/nope/never/evidence-manifest.json'), (error) => {
    assert.equal(error.vsDiagnostics[0].code, 'input/read');
    return true;
  });
});

// ------------------------------------------------------------------- CLI ---

test('--manifest is accepted on validate', () => {
  const dir = tmp();
  try {
    const doc = good();
    const path = writeManifest(dir, manifestFor(dir, doc));
    const out = execFileSync('node', [CLI, 'validate', FIXTURE, '--manifest', path]).toString();
    assert.match(out, /ok/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--manifest is accepted on deliver and the receipt records the verification', () => {
  const dir = tmp();
  try {
    const doc = good();
    const path = writeManifest(dir, manifestFor(dir, doc));
    const artifact = join(dir, 'out.html');
    const out = execFileSync('node',
      [CLI, 'deliver', FIXTURE, artifact, '--manifest', path, '--json']).toString();
    const receipt = JSON.parse(out);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.citationsVerified, true);

    const without = execFileSync('node',
      [CLI, 'deliver', FIXTURE, join(dir, 'out2.html'), '--json']).toString();
    assert.equal(JSON.parse(without).citationsVerified, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validate with a manifest fails loudly when a citation was never read', () => {
  const dir = tmp();
  try {
    const doc = good();
    const casePath = join(dir, 'case.json');
    writeFileSync(casePath, JSON.stringify(doc), 'utf8');
    const path = writeManifest(dir, manifestFor(dir, doc, { titles: { 2: 'Unrelated memo' } }));
    const { stderr } = runFailure(['validate', casePath, '--manifest', path, '--json']);
    const receipt = JSON.parse(stderr);
    assert.equal(receipt.ok, false);
    assert.ok(receipt.diagnostics.some((d) => d.code === 'evidence/not-in-manifest'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deliver with a failing manifest check writes no artifact', () => {
  const dir = tmp();
  try {
    const doc = good();
    const casePath = join(dir, 'case.json');
    writeFileSync(casePath, JSON.stringify(doc), 'utf8');
    const path = writeManifest(dir, manifestFor(dir, doc, { titles: { 0: 'Unrelated memo' } }));
    const artifact = join(dir, 'never.html');
    const { stderr } = runFailure(['deliver', casePath, artifact, '--manifest', path, '--json']);
    assert.match(stderr, /not-in-manifest/);
    assert.throws(() => readFileSync(artifact, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A receipt that reports `citationsVerified` on success and drops it on
// failure is a receipt a consumer cannot read: the absence of the field is
// indistinguishable from "not applicable". The field must be honest on BOTH
// outcomes, or the successful case is the only one anyone can trust.
test('a FAILING deliver --manifest still reports that citations were checked', () => {
  const dir = tmp();
  try {
    const doc = good();
    const casePath = join(dir, 'case.json');
    writeFileSync(casePath, JSON.stringify(doc), 'utf8');
    const manifest = manifestFor(dir, doc);
    // Make a cited source stale, so the failure is a manifest failure.
    writeFileSync(manifest.documents[1].path, 'edited since it was read\n', 'utf8');
    const path = writeManifest(dir, manifest);

    const { stderr } = runFailure(
      ['deliver', casePath, join(dir, 'never.html'), '--manifest', path, '--json']);
    const receipt = JSON.parse(stderr);
    assert.equal(receipt.ok, false);
    assert.equal(receipt.citationsVerified, true,
      'citations WERE checked against a manifest; the failure receipt must say so');
    assert.ok(receipt.diagnostics.some((d) => d.code === 'evidence/manifest-stale'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a FAILING validate --manifest still reports that citations were checked', () => {
  const dir = tmp();
  try {
    const doc = good();
    const casePath = join(dir, 'case.json');
    writeFileSync(casePath, JSON.stringify(doc), 'utf8');
    const path = writeManifest(dir, manifestFor(dir, doc, { titles: { 1: 'Unrelated memo' } }));
    const { stderr } = runFailure(['validate', casePath, '--manifest', path, '--json']);
    const receipt = JSON.parse(stderr);
    assert.equal(receipt.ok, false);
    assert.equal(receipt.citationsVerified, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failure with NO manifest reports citationsVerified false, never absent', () => {
  const dir = tmp();
  try {
    // A failure that has nothing to do with citations: a semantic fault.
    const doc = good();
    doc.claims[0].driver = 'differentiation';
    const casePath = join(dir, 'case.json');
    writeFileSync(casePath, JSON.stringify(doc), 'utf8');

    for (const args of [
      ['validate', casePath, '--json'],
      ['deliver', casePath, join(dir, 'never.html'), '--json'],
    ]) {
      const receipt = JSON.parse(runFailure(args).stderr);
      assert.equal(receipt.ok, false);
      assert.equal(receipt.citationsVerified, false,
        `no manifest was supplied, so ${args[0]} must not leave the question open`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a manifest that cannot be read reports citationsVerified false', () => {
  const receipt = JSON.parse(
    runFailure(['validate', FIXTURE, '--manifest', '/nope/never.json', '--json']).stderr);
  assert.equal(receipt.citationsVerified, false,
    'a manifest was asked for and never read; nothing was verified');
});

// Before the citation check could even be reached, the field is OMITTED rather
// than false: absence says "the question never arose", which is the truth when
// the document did not parse. No reading of an absent field claims that
// citations were checked.
test('a failure before the check could run omits the field rather than guessing', () => {
  const dir = tmp();
  try {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{ not json', 'utf8');
    const receipt = JSON.parse(runFailure(['validate', bad, '--json']).stderr);
    assert.equal(receipt.diagnostics[0].code, 'input/json-parse');
    assert.ok(!('citationsVerified' in receipt),
      'the document never parsed; the citation question never arose');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a typo'd flag is still rejected -- the accepted set was widened, not loosened", () => {
  const dir = tmp();
  try {
    const path = writeManifest(dir, manifestFor(dir, good()));
    const { stderr } = runFailure(['validate', FIXTURE, '--manifst', path]);
    assert.match(stderr, /unrecognised argument: --manifst/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--manifest with no value is rejected rather than swallowing the next argument', () => {
  const { stderr } = runFailure(['validate', FIXTURE, '--manifest']);
  assert.match(stderr, /--manifest requires/);
});

test('--manifest is rejected on commands that cannot honour it', () => {
  const dir = tmp();
  try {
    const path = writeManifest(dir, manifestFor(dir, good()));
    const { stderr } = runFailure(['render', FIXTURE, join(dir, 'x.html'), '--manifest', path]);
    assert.match(stderr, /--manifest is only meaningful/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable manifest fails the CLI with a diagnostic on stderr', () => {
  const { stderr } = runFailure(['validate', FIXTURE, '--manifest', '/nope/never.json', '--json']);
  const receipt = JSON.parse(stderr);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.diagnostics[0].code, 'input/read');
});

// ------------------------------------------------------------------ spec ---

test('spec 5.1 lists both manifest codes', () => {
  const spec = readFileSync(
    fileURLToPath(new URL('../docs/superpowers/specs/2026-09-13-value-story-design.md', import.meta.url)),
    'utf8');
  const section = spec.slice(spec.indexOf('### 5.1 Codes'), spec.indexOf('### 5.2 The manifest'));
  assert.match(section, /evidence\/not-in-manifest/);
  assert.match(section, /evidence\/manifest-stale/);
});
