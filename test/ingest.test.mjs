import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ingestFile, ingestDir, outputName } from '../src/ingest/ingest.mjs';
import { externalText, findBinary, DEFAULT_TOOLS } from '../src/ingest/external.mjs';
import { docxFixture, pptxFixture } from './helpers/zip.mjs';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));

const scratch = [];
function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'vs-ingest-'));
  scratch.push(dir);
  return dir;
}
process.on('exit', () => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function write(dir, name, data) {
  const path = join(dir, name);
  writeFileSync(path, data);
  return path;
}

// ---------------------------------------------------------------------------
// plain text
// ---------------------------------------------------------------------------

test('a .txt file is read as UTF-8 with a title derived from its filename', () => {
  const dir = tmp();
  const path = write(dir, 'cycle_time-notes.txt', 'Cycle time fell to 9 days — café.\n');
  const doc = ingestFile(path);
  assert.equal(doc.skipped, undefined);
  assert.equal(doc.kind, 'doc');
  assert.equal(doc.title, 'cycle time notes');
  assert.match(doc.text, /Cycle time fell to 9 days — café\./);
  assert.equal(doc.bytes, Buffer.byteLength('Cycle time fell to 9 days — café.\n'));
  assert.deepEqual(doc.warnings, []);
});

test('a .md file is read as UTF-8 and a UTF-8 BOM is not left in the text', () => {
  const dir = tmp();
  const path = write(dir, 'brief.md', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('# Brief\n', 'utf8')]));
  const doc = ingestFile(path);
  assert.equal(doc.text, '# Brief\n');
  assert.equal(doc.kind, 'doc');
});

test('a .csv is kind dataset and a .tsv is too; nothing is ever inferred as an interview', () => {
  const dir = tmp();
  const csv = ingestFile(write(dir, 'usage.csv', 'week,minutes\n1,42\n'));
  const tsv = ingestFile(write(dir, 'usage.tsv', 'week\tminutes\n1\t42\n'));
  assert.equal(csv.kind, 'dataset');
  assert.equal(tsv.kind, 'dataset');
  assert.match(csv.text, /week,minutes/);

  const interviewish = ingestFile(write(dir, 'interview-with-cfo.txt', 'Q: ...\n'));
  assert.equal(interviewish.kind, 'doc');
});

test('an empty document is recorded with a warning rather than passing silently', () => {
  const dir = tmp();
  const doc = ingestFile(write(dir, 'blank.txt', ''));
  assert.equal(doc.text, '');
  assert.equal(doc.warnings.length, 1);
  assert.match(doc.warnings[0], /empty/i);
});

// ---------------------------------------------------------------------------
// OOXML, via Task 15
// ---------------------------------------------------------------------------

test('a .docx round trips to the same text Task 15 extracts', () => {
  const dir = tmp();
  const doc = ingestFile(write(dir, 'q3 report.docx', docxFixture()));
  assert.equal(doc.kind, 'doc');
  assert.equal(doc.title, 'q3 report');
  assert.equal(doc.text, 'Cycle time fell from 14 days to 9 days.\nOwner: Kroger & Co. café');
});

test('a .pptx round trips with slides in numeric order', () => {
  const dir = tmp();
  const doc = ingestFile(write(dir, 'deck.pptx', pptxFixture()));
  assert.equal(doc.text, 'Slide 1: Headline 1 Detail 1\nSlide 2: Headline 2 Detail 2\nSlide 10: Headline 10 Detail 10');
});

test('a .docx that is not really an archive is skipped with a reason, not a crash', () => {
  const dir = tmp();
  const result = ingestFile(write(dir, 'broken.docx', 'this is not a zip'));
  assert.equal(result.skipped, true);
  assert.match(result.reason, /zip/i);
});

// ---------------------------------------------------------------------------
// email
// ---------------------------------------------------------------------------

const crlf = (s) => s.replace(/\n/g, '\r\n');

test('a quoted-printable .eml decodes, takes its title from Subject, and shows its headers', () => {
  const dir = tmp();
  const eml = crlf([
    'From: Dana Rivera <dana@example.com>',
    'To: leadership@example.com',
    'Date: Mon, 8 Sep 2025 09:14:02 -0400',
    'Subject: Cycle time after the pilot',
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Cycle time fell from 14 days to 9 =',
    'days. Caf=C3=A9 costs unchanged =E2=80=94 no new spend.',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'pilot.eml', eml));
  assert.equal(doc.kind, 'email');
  assert.equal(doc.title, 'Cycle time after the pilot');
  assert.match(doc.text, /^Subject: Cycle time after the pilot$/m);
  assert.match(doc.text, /^From: Dana Rivera <dana@example\.com>$/m);
  assert.match(doc.text, /^Date: Mon, 8 Sep 2025 09:14:02 -0400$/m);
  // the soft line break must vanish, joining the two halves of one sentence
  assert.match(doc.text, /fell from 14 days to 9 days\./);
  assert.match(doc.text, /Café costs unchanged — no new spend\./);
});

test('a base64 .eml decodes its body', () => {
  const dir = tmp();
  const body = 'Adoption reached 61% of licensed seats — café included.\n';
  const eml = crlf([
    'From: Sam Oyelaran <sam@example.com>',
    'Date: Tue, 9 Sep 2025 11:00:00 +0000',
    'Subject: Adoption update',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64'),
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'adoption.eml', eml));
  assert.equal(doc.title, 'Adoption update');
  assert.match(doc.text, /Adoption reached 61% of licensed seats — café included\./);
});

test('a multipart .eml prefers the text/plain part over text/html', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: Both parts',
    'Content-Type: multipart/alternative; boundary="BOUND42"',
    '',
    '--BOUND42',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'THE PLAIN PART is authoritative.',
    '',
    '--BOUND42',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<html><body><p>THE HTML PART should lose.</p></body></html>',
    '',
    '--BOUND42--',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'both.eml', eml));
  assert.match(doc.text, /THE PLAIN PART is authoritative\./);
  assert.doesNotMatch(doc.text, /THE HTML PART/);
  assert.doesNotMatch(doc.text, /<p>/);
});

test('a multipart .eml with only text/html falls back to stripped tags', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: HTML only',
    'Content-Type: multipart/mixed; boundary="B"',
    '',
    '--B',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    '<html><head><style>p{color:red}</style></head><body><p>Savings were =C2=A3400k.</p>',
    '<p>Second paragraph &amp; more.</p></body></html>',
    '',
    '--B--',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'htmlonly.eml', eml));
  assert.match(doc.text, /Savings were £400k\./);
  assert.match(doc.text, /Second paragraph & more\./);
  assert.doesNotMatch(doc.text, /color:red/);
  assert.doesNotMatch(doc.text, /</);
});

test('an RFC 2047 encoded Subject becomes a readable title', () => {
  const dir = tmp();
  const encoded = `=?UTF-8?B?${Buffer.from('Café résultats', 'utf8').toString('base64')}?=`;
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    `Subject: ${encoded}`,
    '',
    'body',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'enc.eml', eml));
  assert.equal(doc.title, 'Café résultats');
});

test('a folded header is unfolded rather than truncated', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: A very long subject line that the',
    '\tmail client folded in two',
    '',
    'body',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'folded.eml', eml));
  assert.equal(doc.title, 'A very long subject line that the mail client folded in two');
});

// ---------------------------------------------------------------------------
// external binaries
// ---------------------------------------------------------------------------

const IMPOSSIBLE = 'vs-binary-that-cannot-exist-9f3a';

test('findBinary reports a binary that cannot exist as absent', () => {
  assert.equal(findBinary(IMPOSSIBLE), null);
});

test('externalText returns a skip signal, not empty text, when the binary is absent', () => {
  const dir = tmp();
  const path = write(dir, 'x.pdf', '%PDF-1.4\n');
  const tools = { '.pdf': { ...DEFAULT_TOOLS['.pdf'], bin: IMPOSSIBLE } };
  const result = externalText(path, '.pdf', { tools });
  assert.equal(result.ok, false);
  assert.equal(result.text, undefined);
  assert.match(result.reason, new RegExp(IMPOSSIBLE));
});

test('a .pdf whose converter is missing is SKIPPED with an actionable reason naming the binary', () => {
  const dir = tmp();
  const path = write(dir, 'board-pack.pdf', '%PDF-1.4\n');
  const tools = { '.pdf': { ...DEFAULT_TOOLS['.pdf'], bin: IMPOSSIBLE } };
  const result = ingestFile(path, { tools });
  assert.equal(result.skipped, true);
  assert.equal(result.text, undefined);
  assert.match(result.reason, new RegExp(IMPOSSIBLE));
  assert.match(result.reason, /poppler/i);
});

test('the default reasons name the real binaries and how to get them', () => {
  assert.match(DEFAULT_TOOLS['.pdf'].install, /poppler/i);
  assert.equal(DEFAULT_TOOLS['.pdf'].bin, 'pdftotext');
  for (const ext of ['.rtf', '.doc']) {
    assert.equal(DEFAULT_TOOLS[ext].bin, 'textutil');
    assert.match(DEFAULT_TOOLS[ext].install, /macOS/);
  }
});

test('ingestDir records a missing converter as a skip and keeps going', () => {
  const dir = tmp();
  write(dir, 'readable.txt', 'this one is fine');
  write(dir, 'unreadable.pdf', '%PDF-1.4\n');
  const tools = { '.pdf': { ...DEFAULT_TOOLS['.pdf'], bin: IMPOSSIBLE } };
  const result = ingestDir(dir, { tools });
  assert.equal(result.documents.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].path, /unreadable\.pdf$/);
  assert.match(result.skipped[0].reason, new RegExp(IMPOSSIBLE));
});

test('an external converter is invoked without a shell, so spaces and quotes in a filename are inert', { skip: !existsSync('/bin/cat') }, () => {
  const dir = tmp();
  const name = `a file with 'a quote" and $(echo hi).pdf`;
  const path = write(dir, name, 'CONTENT-MARKER');
  const tools = { '.pdf': { bin: '/bin/cat', args: (p) => [p], install: 'n/a' } };
  const result = externalText(path, '.pdf', { tools });
  assert.equal(result.ok, true);
  assert.equal(result.text, 'CONTENT-MARKER');
});

test('a converter that exits non-zero is a skip, never an empty document', () => {
  const dir = tmp();
  const path = write(dir, 'bad.pdf', 'x');
  const tools = { '.pdf': { bin: process.execPath, args: () => ['-e', 'process.exit(3)'], install: 'n/a' } };
  const result = ingestFile(path, { tools });
  assert.equal(result.skipped, true);
  assert.match(result.reason, /fail|exit/i);
});

// ---------------------------------------------------------------------------
// bookkeeping
// ---------------------------------------------------------------------------

test('sha256 is over the file bytes and is stable across runs', () => {
  const dir = tmp();
  const bytes = Buffer.from('Cycle time fell to 9 days.\n', 'utf8');
  const path = write(dir, 'evidence.txt', bytes);
  const a = ingestFile(path);
  const b = ingestFile(path);
  assert.equal(a.sha256, b.sha256);
  assert.equal(a.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(a.bytes, bytes.length);
});

test('sha256 identifies the bytes, not the extraction — a .docx hashes its archive, not its text', () => {
  const dir = tmp();
  const zip = docxFixture();
  const doc = ingestFile(write(dir, 'r.docx', zip));
  assert.equal(doc.sha256, createHash('sha256').update(zip).digest('hex'));
  assert.notEqual(doc.sha256, createHash('sha256').update(doc.text).digest('hex'));
});

test('an unsupported extension is skipped with a reason, not thrown', () => {
  const dir = tmp();
  const result = ingestFile(write(dir, 'logo.png', Buffer.from([0x89, 0x50])));
  assert.equal(result.skipped, true);
  assert.match(result.reason, /\.png/);
  assert.match(result.reason, /support/i);
});

test('a path that does not exist throws — the caller named a file that is not there', () => {
  assert.throws(() => ingestFile(join(tmp(), 'absent.txt')));
});

test('ingestDir returns documents sorted by path so two runs agree', () => {
  const dir = tmp();
  for (const n of ['zeta.txt', 'alpha.txt', 'Mid.md', 'beta.csv']) write(dir, n, `content of ${n}`);
  const first = ingestDir(dir);
  const second = ingestDir(dir);
  const paths = first.documents.map((d) => d.path);
  assert.deepEqual(paths, [...paths].sort());
  assert.deepEqual(paths, second.documents.map((d) => d.path));
  assert.equal(paths.length, 4);
});

test('ingestDir recurses only when asked', () => {
  const dir = tmp();
  write(dir, 'top.txt', 'top');
  mkdirSync(join(dir, 'nested'));
  write(join(dir, 'nested'), 'deep.txt', 'deep');

  const flat = ingestDir(dir);
  assert.deepEqual(flat.documents.map((d) => d.title), ['top']);

  const deep = ingestDir(dir, { recursive: true });
  assert.deepEqual(deep.documents.map((d) => d.title).sort(), ['deep', 'top']);
});

test('outputName is deterministic and distinguishes same-named files in different directories', () => {
  const a = outputName('/one/report.docx');
  const b = outputName('/two/report.docx');
  assert.equal(a, outputName('/one/report.docx'));
  assert.notEqual(a, b);
  assert.ok(a.endsWith('.txt'));
  assert.match(a, /^[A-Za-z0-9._-]+$/);
  assert.match(outputName(`/x/a file with 'a quote".txt`), /^[A-Za-z0-9._-]+$/);
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function cli(args, options = {}) {
  return execFileSync('node', [CLI, ...args], { stdio: 'pipe', encoding: 'utf8', ...options });
}

function cliFailure(args) {
  try {
    execFileSync('node', [CLI, ...args], { stdio: 'pipe' });
    assert.fail(`expected non-zero exit for: vs ${args.join(' ')}`);
  } catch (error) {
    assert.notEqual(error.status, 0);
    assert.notEqual(error.stderr.toString().length, 0, 'expected non-empty stderr');
    assert.equal(error.stdout.toString().length, 0, `expected empty stdout, got: ${error.stdout}`);
    return error.stderr.toString();
  }
}

test('vs ingest writes one .txt per document and prints manifest rows', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  write(src, 'notes.txt', 'Cycle time fell to 9 days.\n');
  write(src, 'deck.pptx', pptxFixture());

  const stdout = cli(['ingest', src, '--out', out]);
  const files = readdirSync(out).sort();
  assert.equal(files.length, 2);
  for (const f of files) assert.ok(f.endsWith('.txt'));
  assert.match(stdout, /notes\.txt/);
  assert.match(stdout, /deck\.pptx/);
  const texts = files.map((f) => readFileSync(join(out, f), 'utf8')).join('\n');
  assert.match(texts, /Cycle time fell to 9 days\./);
  assert.match(texts, /Slide 10: Headline 10/);
});

test('vs ingest --json prints a single parseable object on stdout', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  write(src, 'notes.txt', 'body');
  write(src, 'logo.png', Buffer.from([0x89]));

  const stdout = cli(['ingest', src, '--out', out, '--json']);
  const manifest = JSON.parse(stdout);
  assert.equal(manifest.ok, true);
  assert.equal(manifest.documents.length, 1);
  assert.equal(manifest.documents[0].kind, 'doc');
  assert.equal(manifest.documents[0].sha256.length, 64);
  assert.ok(existsSync(join(out, manifest.documents[0].textFile)));
  assert.equal(manifest.skipped.length, 1);
  assert.match(manifest.skipped[0].reason, /\.png/);
});

test('two same-named files in different directories do not overwrite each other', () => {
  const root = tmp();
  const out = join(tmp(), 'out');
  mkdirSync(join(root, 'one'));
  mkdirSync(join(root, 'two'));
  write(join(root, 'one'), 'report.txt', 'ONE');
  write(join(root, 'two'), 'report.txt', 'TWO');

  const manifest = JSON.parse(cli(['ingest', join(root, 'one', 'report.txt'), join(root, 'two', 'report.txt'), '--out', out, '--json']));
  assert.equal(manifest.documents.length, 2);
  const names = manifest.documents.map((d) => d.textFile);
  assert.notEqual(names[0], names[1]);
  const bodies = names.map((n) => readFileSync(join(out, n), 'utf8')).sort();
  assert.deepEqual(bodies, ['ONE', 'TWO']);
});

test('a filename containing a space and a quote survives the round trip', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  const name = `q3 "final" report.txt`;
  write(src, name, 'QUOTED CONTENT');
  const manifest = JSON.parse(cli(['ingest', join(src, name), '--out', out, '--json']));
  assert.equal(manifest.documents.length, 1);
  assert.equal(readFileSync(join(out, manifest.documents[0].textFile), 'utf8'), 'QUOTED CONTENT');
  assert.match(manifest.documents[0].textFile, /^[A-Za-z0-9._-]+$/);
});

test('vs ingest without --out fails on stderr with an empty stdout', () => {
  const src = tmp();
  write(src, 'a.txt', 'x');
  const stderr = cliFailure(['ingest', src]);
  assert.match(stderr, /--out/);
});

test('vs ingest with --out but no value fails rather than swallowing the next argument', () => {
  const stderr = cliFailure(['ingest', '/tmp', '--out']);
  assert.match(stderr, /--out/);
});

test('vs ingest with no paths fails', () => {
  cliFailure(['ingest', '--out', join(tmp(), 'out')]);
});

test('vs ingest on a path that does not exist fails on stderr', () => {
  const stderr = cliFailure(['ingest', join(tmp(), 'nope.txt'), '--out', join(tmp(), 'out')]);
  assert.match(stderr, /nope\.txt/);
});

test('an unrecognised flag is still rejected now that --out exists', () => {
  const stderr = cliFailure(['ingest', '/tmp', '--out', '/tmp/o', '--outt', 'x']);
  assert.match(stderr, /unrecognised argument: --outt/);
});

test('--out is rejected for commands that do not take it', () => {
  cliFailure(['validate', 'x.json', '--out', '/tmp/o']);
});

test('vs help lists ingest and still exits zero on stdout', () => {
  const stdout = cli(['help', '--json']);
  const help = JSON.parse(stdout);
  assert.ok(help.commands.map((c) => c.name).includes('ingest'));
});

test('vs ingest skips an unreadable document without failing the run', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  write(src, 'good.txt', 'good');
  write(src, 'sheet.xlsx', 'not supported');
  const manifest = JSON.parse(cli(['ingest', src, '--out', out, '--json']));
  assert.equal(manifest.ok, true);
  assert.equal(manifest.documents.length, 1);
  assert.equal(manifest.skipped.length, 1);
});

// ---------------------------------------------------------------------------
// text that is WRONG must never pass as text that is right
// ---------------------------------------------------------------------------

test('a .txt holding an invalid UTF-8 byte still returns text BUT warns that it is not valid UTF-8', () => {
  const dir = tmp();
  // 0xE9 is `é` in Windows-1252 — the commonest artifact of an Excel or Word
  // export, and invalid UTF-8. Buffer.toString would rewrite it as U+FFFD and
  // say nothing.
  const bytes = Buffer.concat([Buffer.from('Price: caf', 'utf8'), Buffer.from([0xe9]), Buffer.from(' today.\n', 'utf8')]);
  const doc = ingestFile(write(dir, 'export.txt', bytes));
  assert.equal(doc.skipped, undefined);
  assert.ok(doc.text.length > 0);
  assert.equal(doc.warnings.length, 1);
  assert.match(doc.warnings[0], /not valid UTF-8/i);
  assert.match(doc.warnings[0], /export\.txt/);
});

test('valid multibyte UTF-8 does NOT trip the invalid-UTF-8 warning', () => {
  const dir = tmp();
  const doc = ingestFile(write(dir, 'clean.txt', 'Cycle time — 9 days. 日本語 café 🙂\n'));
  assert.deepEqual(doc.warnings, []);
  assert.match(doc.text, /Cycle time — 9 days\. 日本語 café 🙂/);
});

test('a .csv holding an invalid UTF-8 byte warns too — every plain format runs the same guard', () => {
  const dir = tmp();
  const bytes = Buffer.concat([Buffer.from('week,note\n1,caf', 'utf8'), Buffer.from([0xe9]), Buffer.from('\n', 'utf8')]);
  const doc = ingestFile(write(dir, 'rows.csv', bytes));
  assert.equal(doc.kind, 'dataset');
  assert.equal(doc.warnings.length, 1);
  assert.match(doc.warnings[0], /not valid UTF-8/i);
});

test('an .eml declaring a charset this runtime cannot decode warns and names the label', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: Legacy mail',
    'Content-Type: text/plain; charset="x-mac-japanese"',
    '',
    'body text',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'legacy.eml', eml));
  assert.ok(doc.warnings.some((w) => /x-mac-japanese/.test(w)), `expected a warning naming the label, got ${JSON.stringify(doc.warnings)}`);
});

test('an .eml in a KNOWN non-UTF-8 charset decodes correctly and warns about nothing', () => {
  const dir = tmp();
  const head = Buffer.from(crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: Shift JIS',
    'Content-Type: text/plain; charset="shift_jis"',
    '',
    '',
  ].join('\n')), 'utf8');
  // カフェ in Shift_JIS
  const body = Buffer.from([0x83, 0x4a, 0x83, 0x74, 0x83, 0x46]);
  const doc = ingestFile(write(dir, 'sjis.eml', Buffer.concat([head, body, Buffer.from('\r\n')])));
  assert.match(doc.text, /カフェ/);
  assert.deepEqual(doc.warnings, []);
});

test('an .eml in iso-8859-1 decodes correctly and warns about nothing', () => {
  const dir = tmp();
  const head = Buffer.from(crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: Latin 1',
    'Content-Type: text/plain; charset="iso-8859-1"',
    '',
    '',
  ].join('\n')), 'utf8');
  const doc = ingestFile(write(dir, 'latin.eml', Buffer.concat([head, Buffer.from([0x63, 0x61, 0x66, 0xe9]), Buffer.from('\r\n')])));
  assert.match(doc.text, /café/);
  assert.deepEqual(doc.warnings, []);
});

test('an .eml carrying attachments warns, naming how many were NOT extracted', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: With attachments',
    'Content-Type: multipart/mixed; boundary="B"',
    '',
    '--B',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'See the two attached files.',
    '',
    '--B',
    'Content-Type: application/pdf; name="board.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    'JVBERi0xLjQK',
    '',
    '--B',
    'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="r.docx"',
    'Content-Transfer-Encoding: base64',
    '',
    'UEsDBAo=',
    '',
    '--B--',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'attached.eml', eml));
  assert.match(doc.text, /See the two attached files\./);
  assert.ok(doc.warnings.some((w) => /2 attachment/.test(w)), `expected an attachment count warning, got ${JSON.stringify(doc.warnings)}`);
});

test('an .eml with headers but no body says so, so "empty" is distinguishable from "dropped"', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: Nothing to say',
    '',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'nobody.eml', eml));
  assert.ok(doc.warnings.some((w) => /no body/i.test(w)), `expected a no-body warning, got ${JSON.stringify(doc.warnings)}`);
});

// ---------------------------------------------------------------------------
// ingesting nothing must not look like success
// ---------------------------------------------------------------------------

function run(args) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8' });
}

test('a folder of only unsupported files exits NON-ZERO with a stderr message, manifest still on stdout', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  write(src, 'logo.png', Buffer.from([0x89]));
  write(src, 'sheet.xlsx', 'nope');

  const result = run(['ingest', src, '--out', out, '--json']);
  assert.notEqual(result.status, 0, 'ingesting nothing must not exit zero');
  assert.match(result.stderr, /NOTHING/);
  // The manifest is the record of WHY nothing came back, so it stays on stdout.
  const manifest = JSON.parse(result.stdout);
  assert.equal(manifest.documents.length, 0);
  assert.equal(manifest.skipped.length, 2);
});

test('one readable file among unsupported ones exits zero BUT warns on stderr about the shortfall', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  write(src, 'good.txt', 'readable');
  write(src, 'logo.png', Buffer.from([0x89]));

  const result = run(['ingest', src, '--out', out, '--json']);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /1 of 2 file\(s\) were skipped/);
  assert.equal(JSON.parse(result.stdout).documents.length, 1);
});

test('everything read means a silent stderr — the warning is a signal, not noise', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  write(src, 'good.txt', 'readable');
  const result = run(['ingest', src, '--out', out, '--json']);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});

test('an empty directory is not a failure — nothing was attempted', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  const result = run(['ingest', src, '--out', out, '--json']);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).documents.length, 0);
});

test('a document warning reaches stdout in human mode and the JSON manifest in --json mode', () => {
  const src = tmp();
  const out = join(tmp(), 'out');
  const bytes = Buffer.concat([Buffer.from('caf', 'utf8'), Buffer.from([0xe9])]);
  write(src, 'export.txt', bytes);

  const human = run(['ingest', src, '--out', out]);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /warning: .*not valid UTF-8/i);

  const json = JSON.parse(run(['ingest', src, '--out', out, '--json']).stdout);
  assert.match(json.documents[0].warnings[0], /not valid UTF-8/i);
});

test('a raw UTF-8 Subject (RFC 6532) is read as UTF-8, not mangled through latin1', () => {
  const dir = tmp();
  const eml = Buffer.concat([
    Buffer.from(crlf('From: a@example.com\nDate: Wed, 10 Sep 2025 08:00:00 +0000\nSubject: '), 'utf8'),
    Buffer.from('Café résultats', 'utf8'),
    Buffer.from(crlf('\n\nbody\n'), 'utf8'),
  ]);
  const doc = ingestFile(write(dir, 'raw8bit.eml', eml));
  assert.equal(doc.title, 'Café résultats');
  assert.doesNotMatch(doc.title, /Ã/);
  assert.deepEqual(doc.warnings, []);
});

test('a header carrying 8-bit bytes that are not UTF-8 is read as latin1 WITH a warning', () => {
  const dir = tmp();
  const eml = Buffer.concat([
    Buffer.from(crlf('From: a@example.com\nDate: Wed, 10 Sep 2025 08:00:00 +0000\nSubject: caf'), 'utf8'),
    Buffer.from([0xe9]), // lone latin1 byte: not valid UTF-8
    Buffer.from(crlf('\n\nbody\n'), 'utf8'),
  ]);
  const doc = ingestFile(write(dir, 'latin-header.eml', eml));
  assert.match(doc.text, /Subject: café/);
  assert.ok(doc.warnings.some((w) => /8-bit/.test(w)), `expected an 8-bit header warning, got ${JSON.stringify(doc.warnings)}`);
});

test('an external converter that returns invalid UTF-8 warns rather than replacing bytes in silence', () => {
  const dir = tmp();
  const path = write(dir, 'x.pdf', 'x');
  const tools = {
    '.pdf': {
      bin: process.execPath,
      args: () => ['-e', 'process.stdout.write(Buffer.from([0x63, 0x61, 0x66, 0xe9]))'],
      install: 'n/a',
    },
  };
  const doc = ingestFile(path, { tools });
  assert.equal(doc.skipped, undefined);
  assert.ok(doc.text.length > 0);
  assert.ok(doc.warnings.some((w) => /valid UTF-8/i.test(w)), `expected a converter encoding warning, got ${JSON.stringify(doc.warnings)}`);
});

test('a well-behaved external converter contributes no warnings', () => {
  const dir = tmp();
  const path = write(dir, 'y.pdf', 'x');
  const tools = {
    '.pdf': { bin: process.execPath, args: () => ['-e', 'process.stdout.write("Cycle time — 9 days.")'], install: 'n/a' },
  };
  const doc = ingestFile(path, { tools });
  assert.equal(doc.text, 'Cycle time — 9 days.');
  assert.deepEqual(doc.warnings, []);
});

test('a base64 body containing characters outside the alphabet warns instead of quietly dropping them', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: Corrupt base64',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    `${Buffer.from('Savings were 400k.', 'utf8').toString('base64')}!!!*`,
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'b64bad.eml', eml));
  assert.ok(doc.warnings.some((w) => /base64 alphabet/.test(w)), `expected a base64 warning, got ${JSON.stringify(doc.warnings)}`);
});

test('a clean base64 body warns about nothing', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: Clean base64',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('Savings were 400k.', 'utf8').toString('base64'),
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'b64ok.eml', eml));
  assert.match(doc.text, /Savings were 400k\./);
  assert.deepEqual(doc.warnings, []);
});

test('an unsupported transfer encoding is announced, not absorbed', () => {
  const dir = tmp();
  const eml = crlf([
    'From: a@example.com',
    'Date: Wed, 10 Sep 2025 08:00:00 +0000',
    'Subject: Odd encoding',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: uuencode',
    '',
    'begin 644 x',
    '',
  ].join('\n'));
  const doc = ingestFile(write(dir, 'uu.eml', eml));
  assert.ok(doc.warnings.some((w) => /uuencode/.test(w)), `expected a transfer-encoding warning, got ${JSON.stringify(doc.warnings)}`);
});
