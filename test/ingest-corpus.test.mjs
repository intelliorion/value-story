/**
 * Task 19 -- the M2 exit gate.
 *
 * Every earlier ingest/manifest/validate test exercised its own layer in
 * isolation. This file is the one that walks the WHOLE path an agent will
 * actually take: a folder of documents about one invented initiative goes
 * in, `vs ingest` produces text plus a manifest FILE, and a hand-authored
 * value case is checked against that manifest with `vs validate --manifest`.
 *
 * The corpus is shaped after a real portfolio record on purpose (see
 * `SKILL.md`, "Reading a portfolio record"): an early-phase initiative with
 * a rubric score, an assumed rating, and an unquantified benefit is the
 * TYPICAL case this tool will be fed, not an edge case.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync, writeFileSync, copyFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

import { ingestDir } from '../src/ingest/ingest.mjs';
import { readManifest } from '../src/manifest.mjs';
import { claimFigures } from '../src/render/claim-card.mjs';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));
const SOURCE_DIR = fileURLToPath(new URL('./fixtures/source', import.meta.url));

const scratch = [];
function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'vs-corpus-'));
  scratch.push(dir);
  return dir;
}
process.on('exit', () => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function cli(args) {
  return execFileSync('node', [CLI, ...args], { stdio: 'pipe', encoding: 'utf8' });
}

// ---------------------------------------------------------------------------
// A minimal, zero-dependency ZIP writer, mirroring the pattern already used
// in test/helpers/zip.mjs (see test/ingest-ooxml.test.mjs). The .docx and
// .pptx corpus documents are built HERE, in memory, at test time -- never
// committed as binary files, never downloaded.
// ---------------------------------------------------------------------------

function makeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const method = f.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const crcOf = crc32(raw) >>> 0;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt32LE(crcOf, 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(name.length, 26);
    locals.push(lfh, name, body);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt32LE(crcOf, 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(name.length, 28);
    cdh.writeUInt32LE(offset, 42);
    central.push(cdh, name);

    offset += 30 + name.length + body.length;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

const wp = (...runs) => `<w:p>${runs.join('')}</w:p>`;
const wt = (s) => `<w:r><w:t xml:space="preserve">${s}</w:t></w:r>`;
const at = (s) => `<a:p><a:r><a:t>${s}</a:t></a:r></a:p>`;

/**
 * Document 1: the `.docx` status report -- narrative prose, deliberately
 * carrying NO hard figures. This is the "early phase, no numbers yet"
 * document the project owner says is typical.
 */
function statusReportDocx() {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${wp(wt('The Contract Review Assistant pilot continues within the Vendor Contracts team, and reviewer sentiment remains positive.'))}
${wp(wt('Reviewers say the tool surfaces non-standard clauses earlier in the process than manual triage did, and the team is comfortable relying on it for routine reviews.'))}
${wp(wt('The team plans to extend the pilot to lease agreements next quarter, pending sign-off from Legal Operations. No change to headcount is planned as a result of this pilot.'))}
</w:body></w:document>`;
  return makeZip([
    { name: '[Content_Types].xml', data: '<Types/>', method: 0 },
    { name: 'word/document.xml', data: xml, method: 8 },
  ]);
}

/**
 * Document 2: the `.pptx` review deck -- ONE asserted figure with nothing
 * behind it ("about a third"). This is the conflict case's FIRST half: see
 * the comment above `buildCorpus` below.
 */
function reviewDeckPptx() {
  const files = [
    { name: '[Content_Types].xml', data: '<Types/>', method: 0 },
    { name: 'ppt/presentation.xml', data: '<p:presentation/>', method: 8 },
  ];
  const slides = [
    ['Contract Review Assistant — Executive Review', 'Pilot underway with the Vendor Contracts team.'],
    ['Early Signal', 'Review effort is down by about a third since rollout, per reviewer self-report. No dataset behind this number yet.'],
  ];
  slides.forEach(([headline, detail], i) => {
    files.push({
      name: `ppt/slides/slide${i + 1}.xml`,
      data: `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${at(headline)}${at(detail)}</p:spTree></p:cSld></p:sld>`,
      method: i % 2 === 0 ? 8 : 0,
    });
  });
  return makeZip(files);
}

// ---------------------------------------------------------------------------
// THE CONFLICT CASE -- read this before touching anything below.
//
// The review deck (slide 2, above) asserts review effort is "down by about a
// third" (~33%), sourced only to reviewer self-report. The portfolio record
// (test/fixtures/source/portfolio-record.md, Notes section) separately says
// the sponsor reports effort "dropped by roughly 20%". Same underlying claim
// -- review-effort reduction on the same initiative -- two different figures,
// neither backed by the measured dataset (metrics.csv covers turnaround time
// and reviewer throughput, NOT review effort).
//
// This is DELIBERATE and MUST STAY UNRESOLVED by this codebase. No test
// below diffs these two figures, no diagnostic fires on the mismatch, and
// no future change to this file should add one. The corpus exists so a
// later exercise can test whether an AGENT reading both documents notices
// the discrepancy and reports it -- reconciling it here, mechanically,
// would remove the very thing the corpus is for.
// ---------------------------------------------------------------------------

/** Build the ephemeral corpus directory: three static files copied in, two
 * OOXML files built in memory. Nothing under test/fixtures/source is ever
 * written to. */
function buildCorpus() {
  const dir = tmp();
  copyFileSync(join(SOURCE_DIR, 'thread.eml'), join(dir, 'thread.eml'));
  copyFileSync(join(SOURCE_DIR, 'metrics.csv'), join(dir, 'metrics.csv'));
  copyFileSync(join(SOURCE_DIR, 'portfolio-record.md'), join(dir, 'portfolio-record.md'));
  writeFileSync(join(dir, 'status-report.docx'), statusReportDocx());
  writeFileSync(join(dir, 'review-deck.pptx'), reviewDeckPptx());
  return dir;
}

// The exact titles `vs ingest` will assign to the five corpus documents,
// derived the same way ingest.mjs derives them (filename stem for four of
// them, the Subject header for the .eml).
const TITLES = {
  status: 'status report',
  deck: 'review deck',
  thread: 'Re: Contract Review Assistant — pilot feedback',
  metrics: 'metrics',
  portfolio: 'portfolio record',
};

/** A hand-authored value case citing every one of the five corpus titles. */
function authoredCase() {
  return {
    schema_version: 1,
    meta: { title: 'Contract Review Assistant', owner: 'R. Alvarez', period: '2026-08', quality_profile: 'draft', motion: 'static' },
    initiative: { id: 'cra-01', name: 'Contract Review Assistant', sponsor: 'R. Alvarez', function: 'Legal Operations', status: 'pilot' },
    drivers: { primary: 'process-cost-efficiency', secondary: ['productivity', 'governance-oversight'] },
    arc: {
      problem: {
        headline: 'Vendor contract review took too long and missed non-standard clauses',
        detail: 'Every vendor contract went through the same manual review queue regardless of urgency or complexity.',
        evidence_refs: ['e1'],
      },
      capability: {
        headline: 'Contracts are triaged and flagged automatically before a reviewer opens them',
        detail: 'Non-standard indemnification and liability clauses are surfaced at intake, rather than depending on a reviewer catching them.',
        evidence_refs: ['e3'],
        novelty: 'incremental',
      },
      outcome: { headline: 'Turnaround fell and reviewer throughput rose', claim_refs: ['c1', 'c2', 'c3'] },
      significance: {
        headline: 'A pattern other legal-adjacent teams can reuse',
        detail: 'The same triage-and-flag approach could extend to lease agreements and other contract families without new headcount.',
        evidence_refs: ['e5'],
      },
    },
    claims: [
      {
        id: 'c1', driver: 'process-cost-efficiency', tier: 'measured',
        metric: 'contract turnaround time', unit: 'business days', direction: 'decrease',
        baseline: { value: 9, asof: '2026-01', evidence_ref: 'e4' },
        current: { value: 5, asof: '2026-08', evidence_ref: 'e4' },
      },
      {
        id: 'c2', driver: 'productivity', tier: 'measured',
        metric: 'contracts reviewed per reviewer per week', unit: 'contracts/week', direction: 'increase',
        baseline: { value: 12, asof: '2026-01', evidence_ref: 'e4' },
        current: { value: 18, asof: '2026-08', evidence_ref: 'e4' },
      },
      {
        id: 'c3', driver: 'governance-oversight', tier: 'qualitative',
        statement: 'The assistant flags non-standard indemnification and liability clauses before a reviewer opens the document',
        evidence_ref: 'e3',
      },
    ],
    evidence: [
      { ref: 'e1', kind: 'doc', title: TITLES.status, author: 'Legal Operations', date: '2026-08-10', locator: 'paragraph 2' },
      { ref: 'e2', kind: 'doc', title: TITLES.deck, author: 'Legal Operations', date: '2026-08-18', locator: 'slide 2' },
      { ref: 'e3', kind: 'email', title: TITLES.thread, author: 'Dana Whitfield', date: '2026-08-12', locator: 'message body' },
      { ref: 'e4', kind: 'dataset', title: TITLES.metrics, author: 'Legal Operations', date: '2026-08-30', locator: 'contract turnaround time; contracts reviewed per reviewer per week rows' },
      { ref: 'e5', kind: 'doc', title: TITLES.portfolio, author: 'Portfolio Committee', date: '2026-08-20', locator: 'Notes section' },
    ],
  };
}

// The rubric scores in the portfolio record -- these must NEVER appear as
// authorised figures on any claim in the authored case. This is the trap
// the corpus exists to set (see SKILL.md, "Reading a portfolio record").
// (Strategic fit 4, Reach 2, Feasibility 4, Risk 3, Evidence quality 2.)
const RUBRIC_SCORES = ['4', '2', '3'];

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

test('every corpus file ingests without error; the skip list is empty', () => {
  const dir = buildCorpus();
  const { documents, skipped } = ingestDir(dir);
  assert.deepEqual(skipped, []);
  assert.equal(documents.length, 5);
  const titles = documents.map((d) => d.title).sort();
  assert.deepEqual(titles, [TITLES.deck, TITLES.metrics, TITLES.portfolio, TITLES.status, TITLES.thread].sort());
});

test('the manifest has one row per file, with sha256 stable across two runs', () => {
  const dir = buildCorpus();
  const outA = join(tmp(), 'out-a');
  const outB = join(tmp(), 'out-b');

  const manifestA = JSON.parse(cli(['ingest', dir, '--out', outA, '--json']));
  const manifestB = JSON.parse(cli(['ingest', dir, '--out', outB, '--json']));

  assert.equal(manifestA.documents.length, 5);
  assert.equal(manifestB.documents.length, 5);

  const rowsA = readManifest(join(outA, 'evidence-manifest.json')).documents;
  const rowsB = readManifest(join(outB, 'evidence-manifest.json')).documents;
  const byPathA = new Map(rowsA.map((d) => [d.path, d]));
  const byPathB = new Map(rowsB.map((d) => [d.path, d]));
  assert.deepEqual([...byPathA.keys()].sort(), [...byPathB.keys()].sort());

  for (const [path, rowA] of byPathA) {
    const rowB = byPathB.get(path);
    assert.equal(rowA.sha256, rowB.sha256, `sha256 for ${path} must be stable across runs`);
    // ingested_at is the one field expected to differ between runs -- it is
    // a real wall-clock timestamp taken once per `vs ingest` invocation, not
    // a hash of anything. Every OTHER field must agree exactly.
    const { ingested_at: atA, ...restA } = rowA;
    const { ingested_at: atB, ...restB } = rowB;
    assert.deepEqual(restA, restB);
  }
});

test('the manifest file validates against schemas/evidence-manifest.schema.json', () => {
  const dir = buildCorpus();
  const out = join(tmp(), 'out');
  cli(['ingest', dir, '--out', out, '--json']);
  // readManifest parses AND schema-validates; it throws on any failure.
  const manifest = readManifest(join(out, 'evidence-manifest.json'));
  assert.equal(manifest.documents.length, 5);
});

test('vs ingest --json names the manifest file it wrote', () => {
  const dir = buildCorpus();
  const out = join(tmp(), 'out');
  const result = JSON.parse(cli(['ingest', dir, '--out', out, '--json']));
  const expected = join(out, 'evidence-manifest.json');
  assert.equal(result.manifest, expected);
  assert.ok(existsSync(result.manifest), 'the named manifest path must actually exist');
  // Additive only: every field the pre-existing tests assert on is still there.
  assert.equal(result.ok, true);
  assert.equal(result.out, out);
  assert.equal(result.documents.length, 5);
});

test('a hand-authored case citing the five corpus titles validates CLEAN with --manifest', () => {
  const dir = buildCorpus();
  const out = join(tmp(), 'out');
  cli(['ingest', dir, '--out', out, '--json']);
  const manifestPath = join(out, 'evidence-manifest.json');

  const caseDir = tmp();
  const casePath = join(caseDir, 'case.json');
  writeFileSync(casePath, JSON.stringify(authoredCase(), null, 2));

  const stdout = cli(['validate', casePath, '--manifest', manifestPath, '--json']);
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.citationsVerified, true);
  assert.deepEqual(receipt.diagnostics, []);
});

test('altering ONE evidence title fires exactly one evidence/not-in-manifest, offering the real title as a candidate', () => {
  const dir = buildCorpus();
  const out = join(tmp(), 'out');
  cli(['ingest', dir, '--out', out, '--json']);
  const manifestPath = join(out, 'evidence-manifest.json');

  const brokenCase = authoredCase();
  const realTitle = brokenCase.evidence[0].title;
  assert.equal(realTitle, TITLES.status);
  brokenCase.evidence[0].title = 'status reports'; // a near miss, not a typo of nothing

  const caseDir = tmp();
  const casePath = join(caseDir, 'case.json');
  writeFileSync(casePath, JSON.stringify(brokenCase, null, 2));

  let stdout = '';
  let stderr = '';
  let status = 0;
  try {
    stdout = execFileSync('node', [CLI, 'validate', casePath, '--manifest', manifestPath, '--json'], { stdio: 'pipe', encoding: 'utf8' });
  } catch (error) {
    stdout = error.stdout;
    stderr = error.stderr;
    status = error.status;
  }
  assert.notEqual(status, 0);
  assert.equal(stdout.length, 0, `expected empty stdout on failure, got: ${stdout}`);
  const receipt = JSON.parse(stderr);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.citationsVerified, true);
  const fired = receipt.diagnostics.filter((d) => d.code === 'evidence/not-in-manifest');
  assert.equal(fired.length, 1, `expected exactly one evidence/not-in-manifest, got: ${JSON.stringify(receipt.diagnostics)}`);
  assert.equal(fired[0].subject.title, 'status reports');
  assert.ok(fired[0].evidence.candidates.includes(realTitle),
    `expected the real title ${JSON.stringify(realTitle)} among the offered candidates`);
  assert.match(fired[0].message, new RegExp(realTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('the rubric scores in the portfolio record are never authorised as claim figures -- the trap the corpus sets', () => {
  const doc = authoredCase();
  const authorised = new Set(doc.claims.flatMap(claimFigures));
  for (const score of RUBRIC_SCORES) {
    assert.ok(!authorised.has(score),
      `rubric score ${JSON.stringify(score)} from the portfolio record must never appear as an authorised claim figure`);
  }
  // Positive control: the actually-measured figures from metrics.csv ARE
  // authorised, so the assertion above is testing something real and not
  // vacuously true because no figures exist at all.
  assert.ok(authorised.has('9') && authorised.has('5') && authorised.has('12') && authorised.has('18'));
});
