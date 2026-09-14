#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCase } from '../src/render/render-case.mjs';
import { validateCase } from '../src/validate.mjs';
import { deliverCase } from '../src/deliver.mjs';
import { installDiagnosticBoundary, fallbackDiagnostic } from '../src/diagnostics.mjs';
import { ingestFile, ingestDir, outputName } from '../src/ingest/ingest.mjs';
import { readManifest } from '../src/manifest.mjs';

installDiagnosticBoundary();

const HELP = {
  name: 'value-story',
  description: 'Turn a typed value-case JSON document into a validated, self-contained HTML value narrative.',
  contract: 'SKILL.md',
  commands: [
    { name: 'help', usage: 'vs help [--json]', description: 'Describe every command.' },
    { name: 'schema', usage: 'vs schema', description: 'Print the value-case JSON Schema.' },
    { name: 'render', usage: 'vs render <input.json> <output.html>', description: 'Render without validating. Use during visual iteration only.' },
    { name: 'validate', usage: 'vs validate <input.json> [--manifest <m.json>] [--json]', description: 'Check schema, invariants and figure tracing. With --manifest, also refuse any citation naming a source that was never read. Returns a repair receipt on failure.' },
    { name: 'deliver', usage: 'vs deliver <input.json> <output.html> [--manifest <m.json>] [--json]', description: 'Validate, then atomically write the artifact. Final acceptance. The receipt reports citationsVerified, which is false unless --manifest was supplied.' },
    { name: 'ingest', usage: 'vs ingest <path...> --out <dir> [--json]', description: 'Extract readable text from documents (directories are read recursively) and print the manifest rows describing exactly what was read.' },
    { name: 'visual-check', usage: 'vs visual-check <output.html> [--json]', description: 'Measure the DELIVERED artifact in a real browser at 1440x900, 1600x1000 and 1920x1080: horizontal overflow, WCAG 2.1 text contrast, text collision, and the hero delta above the fold at every one of them. Scrolling down is not a finding, and an artifact with no hero delta skips that check rather than failing it. Requires Playwright (a devDependency). Proves bounded behaviour, never that the artifact is good.' },
  ],
  receipt: {
    onFailure: 'JSON on stderr: { schemaVersion, ok:false, diagnostics:[{ code, severity, message, subject, evidence, supportedFixes }] }',
    supportedFixes: 'For a document-level diagnostic each entry names a JSON Pointer into the input document; apply one per repair round. The `layout/*` findings from `visual-check` are the exception: they name a CSS selector and a file under src/render/, are addressed to the maintainer of the renderer, and are never repaired by editing the value case.',
  },
};

const rawArgv = process.argv.slice(2);
// Computed up front from the raw argv so it is safe to use before the
// (later) positional parse -- both the --help short-circuit and every
// failure path need it.
const asJson = rawArgv.includes('--json');

// help/usage text is generated once and only routed to a destination -- a
// deliberate `vs help`/`--help` request goes to stdout and exits 0; every
// failure path below reuses the exact same text on stderr with a non-zero
// exit, so the two can never drift apart.
function helpPayload() {
  if (asJson) return `${JSON.stringify(HELP, null, 2)}\n`;
  const lines = HELP.commands.map((c) => `  ${c.usage.padEnd(46)} ${c.description}`);
  return `${HELP.description}\n\n${lines.join('\n')}\n`;
}

function printHelp(dest) {
  (dest === 'stderr' ? process.stderr : process.stdout).write(helpPayload());
}

// A deliberate request for help always succeeds, regardless of anything
// else on the command line.
if (rawArgv.includes('--help') || rawArgv.includes('-h')) {
  printHelp('stdout');
  process.exit(0);
}

// Addition 1: reject any other unrecognised flag rather than silently
// treating it as a positional argument. The CLI understands only --json and
// --out <dir> (plus --help/-h, handled above); everything else beginning with
// a dash is rejected. This is itself a failure path: nothing useful goes to
// stdout, and stderr carries the diagnostic.
//
// --out consumes the argument after it, so its value is never mistaken for a
// positional path -- and a missing or dash-leading value is a failure rather
// than a silently swallowed argument.
const positional = [];
let outDir = null;
let manifestPath = null;
for (let i = 0; i < rawArgv.length; i++) {
  const arg = rawArgv[i];
  if (arg === '--json') continue;
  if (arg === '--out' || arg === '--manifest') {
    const value = rawArgv[i + 1];
    if (value === undefined || value.startsWith('-')) {
      process.stderr.write(arg === '--out'
        ? '--out requires a directory argument: vs ingest <path...> --out <dir>\n'
        : '--manifest requires a file argument: vs validate <input.json> --manifest <manifest.json>\n');
      process.exit(1);
    }
    if (arg === '--out') outDir = value;
    else manifestPath = value;
    i++;
    continue;
  }
  if (arg === '-' || arg === '--' || arg.startsWith('-')) {
    process.stderr.write(`unrecognised argument: ${arg}\nonly --json, --out <dir> and --manifest <path> are supported flags.\n`);
    process.exit(1);
  }
  positional.push(arg);
}

const [command, input, output] = positional;

if (outDir !== null && command !== 'ingest') {
  process.stderr.write(`--out is only meaningful for vs ingest, not vs ${command || '(none)'}\n`);
  process.exit(1);
}

// `--manifest` is accepted on validate and deliver, and ONLY there. `render`
// does not validate at all, so honouring the flag there would be theatre;
// `ingest` produces a manifest rather than consuming one.
if (manifestPath !== null && command !== 'validate' && command !== 'deliver') {
  process.stderr.write(`--manifest is only meaningful for vs validate and vs deliver, not vs ${command || '(none)'}\n`);
  process.exit(1);
}

/**
 * @param {object[]} diagnostics
 * @param {object} [extra] further receipt fields, merged ahead of `diagnostics`.
 *
 * A receipt that reports `citationsVerified` on success and drops it on failure
 * is one a consumer cannot read: the absence of the field would be
 * indistinguishable from "not applicable". So the callers that KNOW whether a
 * manifest was in play pass it here, on the failure path as much as the success
 * path. Callers that failed before the question could arise pass nothing, and
 * absence then means exactly that. No state of this receipt can be read as a
 * claim that citations were checked when they were not.
 */
function emitFailure(diagnostics, extra = {}) {
  const receipt = { schemaVersion: 1, ok: false, ...extra, diagnostics };
  process.stderr.write(asJson
    ? `${JSON.stringify(receipt, null, 2)}\n`
    : `${diagnostics.map((d) => `${d.code}: ${d.message}\n  fix: ${d.supportedFixes[0] || 'none offered'}`).join('\n')}\n`);
  process.exit(1);
}

if (!command || command === 'help') {
  printHelp('stdout');
  process.exit(0);
}

if (command === 'schema') {
  const path = fileURLToPath(new URL('../schemas/value-case.schema.json', import.meta.url));
  process.stdout.write(readFileSync(path, 'utf8'));
  process.exit(0);
}

if (command === 'ingest') {
  const paths = positional.slice(1);
  if (paths.length === 0 || !outDir) {
    process.stderr.write('usage: vs ingest <path...> --out <dir> [--json]\n');
    process.exit(1);
  }

  const documents = [];
  const skipped = [];
  for (const path of paths) {
    let stats;
    try {
      stats = statSync(path);
    } catch (error) {
      // A path the caller named explicitly and that is not there is their
      // error, not a skip: fail rather than quietly ingest less than asked.
      process.stderr.write(`${path}: ${error.message}\n`);
      process.exit(1);
    }
    if (stats.isDirectory()) {
      const result = ingestDir(path, { recursive: true });
      documents.push(...result.documents);
      skipped.push(...result.skipped);
    } else {
      const result = ingestFile(path);
      if (result.skipped) skipped.push({ path: result.path, reason: result.reason });
      else documents.push(result);
    }
  }

  // Sorted so that two runs over the same inputs agree row for row.
  documents.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  skipped.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // THE TITLE IS THE JOIN KEY. `src/manifest.mjs` resolves a citation by
  // matching `evidence[].title` against a manifest row, so two rows sharing a
  // title make that resolution meaningless -- and two `.eml` files exported
  // from one thread share a `Subject:`, which is ordinary rather than exotic.
  //
  // This is a HARD ERROR and not a warning, and no title is disambiguated
  // automatically. Appending a filename would produce a title nobody chose,
  // silently changing what a citation has to say to resolve; refusing puts the
  // decision where the knowledge is. Nothing is written when this fires: a
  // half-written output directory would invite a second run over a corpus that
  // is still ambiguous.
  const byTitle = new Map();
  for (const doc of documents) {
    const rows = byTitle.get(doc.title);
    if (rows) rows.push(doc);
    else byTitle.set(doc.title, [doc]);
  }
  const collisions = [...byTitle.entries()].filter(([, rows]) => rows.length > 1);
  if (collisions.length > 0) {
    const lines = collisions.map(([title, rows]) => `  ${JSON.stringify(title)} is the title of ${rows.length} documents:\n`
      + rows.map((r) => `    ${r.path}`).join('\n'));
    process.stderr.write(
      `${collisions.length} duplicate title(s) across ${documents.length} document(s). `
      + 'A citation names a document by its TITLE, so two documents with one title can never be told apart '
      + '— and a manifest written from them would resolve every citation to whichever row came first.\n'
      + `${lines.join('\n')}\n`
      + 'Disambiguate before ingesting: rename one of the files, or ingest them separately into different '
      + 'output directories. Nothing was written.\n',
    );
    process.exit(1);
  }

  try {
    mkdirSync(outDir, { recursive: true });
    for (const doc of documents) {
      doc.textFile = outputName(doc.path);
      writeFileSync(join(outDir, doc.textFile), doc.text, 'utf8');
    }
  } catch (error) {
    process.stderr.write(`could not write extracted text to ${outDir}: ${error.message}\n`);
    process.exit(1);
  }

  // The manifest rows carry metadata only; the text itself is on disk, one
  // file per document, so a large corpus does not have to pass through stdout.
  const rows = documents.map((d) => ({
    path: d.path,
    title: d.title,
    kind: d.kind,
    sha256: d.sha256,
    bytes: d.bytes,
    ingested_at: d.ingested_at,
    characters: d.text.length,
    textFile: d.textFile,
    warnings: d.warnings,
  }));

  // The manifest FILE, written next to the extracted text.
  //
  // This is a different object from the run report on stdout, deliberately.
  // Stdout says what HAPPENED -- including what was skipped and where each
  // extraction landed. The manifest is the citation ledger, and answers only
  // one question: what was READ. A skipped file was not read, so it is absent
  // here while staying visible on stdout; letting it into the ledger would
  // make a document citable that nobody ever opened, which is the single
  // failure `src/manifest.mjs` exists to prevent.
  //
  // `ingested_at` is a REAL timestamp, stamped PER DOCUMENT by `ingestFile` at
  // the moment that document was read. The source file's mtime was the
  // reproducible alternative and was rejected: mtime is when a document was
  // last WRITTEN, and putting that in a field named for when it was READ is a
  // plausible-but-wrong value of exactly the kind this pipeline refuses
  // everywhere else. The manifest is a per-run output, not a committed
  // generated file, so losing byte-identical reruns costs nothing.
  const manifestPathOut = join(outDir, 'evidence-manifest.json');
  try {
    writeFileSync(manifestPathOut, `${JSON.stringify({
      schema_version: 1,
      documents: rows,
    }, null, 2)}\n`, 'utf8');
  } catch (error) {
    process.stderr.write(`could not write the evidence manifest to ${manifestPathOut}: ${error.message}\n`);
    process.exit(1);
  }

  if (asJson) {
    // `manifest` names the file just written above, additively -- a machine
    // consumer previously had to join `out` with a hardcoded
    // "evidence-manifest.json" to find it, which breaks silently if that
    // convention ever changes. Every other field is unchanged.
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: true, out: outDir, manifest: manifestPathOut, documents: rows, skipped }, null, 2)}\n`);
  } else {
    for (const row of rows) {
      process.stdout.write(`${row.kind.padEnd(8)} ${row.sha256.slice(0, 12)} ${String(row.bytes).padStart(9)}B  ${row.path} -> ${row.textFile}\n`);
      for (const warning of row.warnings) process.stdout.write(`  warning: ${warning}\n`);
    }
    for (const s of skipped) process.stdout.write(`SKIP     ${s.path}\n  reason: ${s.reason}\n`);
    process.stdout.write(`${rows.length} document(s) read, ${skipped.length} skipped.\n`);
  }

  // "I ingested nothing" must never look like success. A skip list on stdout
  // is invisible to a caller that redirects stdout, so the shortfall is also
  // announced on stderr -- and ingesting NOTHING when something was attempted
  // is a failure of what was asked for, not a partial result.
  //
  // The manifest stays on stdout in both cases: it is the record of what was
  // read, and a caller parsing --json still needs it to see WHY nothing came
  // back. Nothing else is ever written to stdout on this path.
  const attempted = documents.length + skipped.length;
  if (attempted === 0) {
    process.exit(0); // nothing was there to read; that is not a failure
  }
  if (documents.length === 0) {
    process.stderr.write(`ingested NOTHING: all ${skipped.length} file(s) were skipped. See the reasons in the manifest; no document was read.\n`);
    process.exit(1);
  }
  if (skipped.length > 0) {
    process.stderr.write(`warning: ${skipped.length} of ${attempted} file(s) were skipped and NOT ingested. See the manifest for the reasons.\n`);
  }
  process.exit(0);
}

if (command === 'visual-check') {
  if (!input) {
    process.stderr.write('usage: vs visual-check <output.html> [--json]\n');
    process.exit(1);
  }

  // Imported HERE rather than at the top of the file so that every OTHER
  // command keeps working with Playwright uninstalled. `scripts/visual-check.mjs`
  // itself imports only `node:*`; Playwright is loaded dynamically inside it.
  const { visualCheck } = await import('../scripts/visual-check.mjs');

  let result;
  try {
    result = await visualCheck(input);
  } catch (error) {
    // `vsClean` errors carry a message written to be read by a person. Anything
    // else is routed through the same diagnostic the rest of the CLI uses, so
    // no path here can print a raw stack trace.
    process.stderr.write(error?.vsClean
      ? `${error.message}\n`
      : `${fallbackDiagnostic(error, input).message}\n`);
    process.exit(1);
  }

  const receipt = {
    schemaVersion: 1,
    ok: result.ok,
    artifact: result.path,
    sha256: result.sha256,
    summary: result.summary,
    viewports: result.viewports,
    findings: result.findings,
  };

  /**
   * What was MEASURED, in the same `reported of total` idiom the findings use.
   *
   * Without this a page whose only text sits on an unresolvable background
   * prints "no horizontal overflow" and exits 0 — "nothing was measured"
   * wearing the face of "nothing measured wrong". The human path must be able
   * to tell those apart, not only the --json one.
   */
  function measuredLines(summary) {
    const lines = [];
    const text = summary.measured?.textElements;
    const contrast = summary.measured?.contrast;
    if (text && text.truncated > 0) {
      lines.push(`${text.reported} of ${text.total} text element(s) were measured; `
        + `${text.truncated} were withheld by the per-viewport cap of ${text.cap}.`);
    }
    if (contrast) {
      lines.push(`contrast: ${contrast.reported} of ${contrast.total} text element(s) measured, `
        + `${contrast.skipped} skipped.`);
      for (const row of contrast.reasons.slice(0, 3)) {
        lines.push(`  skipped because ${row.reason} (x${row.count})`);
      }
      if (contrast.skipped > contrast.listed) {
        lines.push(`  ${contrast.listed} of ${contrast.skipped} skip reason(s) are listed; the rest are in --json.`);
      }
    }
    return lines.length ? `${lines.join('\n')}\n` : '';
  }

  // A receipt for an artifact with many findings runs to tens of kilobytes, and
  // `process.exit` does not wait for an async pipe write to drain — piping this
  // command into a consumer truncated the JSON at 8KB. Exit only once the
  // stream has actually flushed.
  const flush = (stream, text) => new Promise((done) => { stream.write(text, done); });

  if (result.ok) {
    await flush(process.stdout, asJson
      ? `${JSON.stringify(receipt, null, 2)}\n`
      : `${result.viewports.map((v) => `${v.viewport.padEnd(10)} scrollWidth ${String(v.scrollWidth).padStart(5)} <= innerWidth ${v.innerWidth}`).join('\n')}\n`
        + `no horizontal overflow at ${result.viewports.length} viewport(s). This proves bounded behaviour, not that the artifact is good.\n`
        + measuredLines(result.summary));
    process.exit(0);
  }

  // A gate that reports problems and exits 0 gets ignored in scripts, so a
  // finding is a failure: non-zero, stderr, nothing on stdout — the same
  // discipline every other command here is held to.
  // The findings ARRAY is capped per viewport, so printing its length alone
  // reports every artifact as equally bad. Reported is always stated against
  // measured — "15 of 36", never a bare "15".
  const { summary } = result;
  const withheld = summary.truncated > 0
    ? `${summary.truncated} more were measured and withheld by the per-viewport cap of ${summary.cap}; `
      + 'the full counts are in --json.'
    : 'nothing was withheld.';
  const perCode = summary.byCode
    .map((row) => `  ${row.code}: ${row.reported} of ${row.total}`)
    .join('\n');

  await flush(process.stderr, asJson
    ? `${JSON.stringify(receipt, null, 2)}\n`
    : `${result.findings.map((f) => `${f.code}: ${f.message}\n  fix: ${f.supportedFixes[0]}`).join('\n')}\n`
      + `\n${summary.reported} of ${summary.total} findings reported — ${withheld}\n${perCode}\n`
      + measuredLines(summary));
  process.exit(1);
}

if (!['render', 'validate', 'deliver'].includes(command) || !input
    || ((command === 'render' || command === 'deliver') && !output)) {
  process.stderr.write(`unknown or incomplete command: vs ${rawArgv.join(' ') || '(none)'}\n\n`);
  printHelp('stderr');
  process.exit(1);
}

let doc;
try {
  doc = JSON.parse(readFileSync(input, 'utf8'));
} catch (error) {
  emitFailure([fallbackDiagnostic(error, input)]);
}

// The manifest is read and schema-checked BEFORE the case is validated, so a
// broken manifest is reported as the broken manifest rather than as a document
// full of unresolvable citations. `readManifest` throws with `vsDiagnostics`.
let manifest = null;
if (manifestPath !== null) {
  try {
    manifest = readManifest(manifestPath);
  } catch (error) {
    // A manifest WAS asked for and could not be read, so nothing was verified.
    // That is `false`, not absence: the question arose and has an answer.
    emitFailure(error.vsDiagnostics || [fallbackDiagnostic(error, manifestPath)],
      { citationsVerified: false });
  }
}
const options = manifest ? { manifest } : {};

if (command === 'render') {
  writeFileSync(output, renderCase(doc), 'utf8');
  process.stdout.write(`${output}\n`);
} else if (command === 'validate') {
  const result = validateCase(doc, options);
  // `citationsVerified` rides BOTH outcomes for the same reason: silence about
  // whether citations were checked is what lets an unverified case pass for a
  // verified one, and a failure receipt is read just as carefully as a success.
  const citationsVerified = Boolean(manifest);
  if (!result.ok) emitFailure(result.diagnostics, { citationsVerified });
  // `ok` can be true with WARNING-severity diagnostics standing -- a cited
  // source whose file has moved, or whose extraction recorded a decode
  // warning. Printing a hardcoded empty array here threw those away at the
  // last step, which made a warned source indistinguishable from a clean one.
  process.stdout.write(asJson
    ? `${JSON.stringify({ schemaVersion: 1, ok: true, citationsVerified, diagnostics: result.diagnostics }, null, 2)}\n`
    : `ok\n${result.diagnostics.map((d) => `${d.severity}: ${d.code}: ${d.message}\n  fix: ${d.supportedFixes[0] || 'none offered'}`).join('\n')}${result.diagnostics.length ? '\n' : ''}`);
} else {
  const receipt = deliverCase(doc, output, options);
  // Taken from the receipt deliverCase already computed, rather than recomputed
  // here, so the CLI cannot drift from the library's answer.
  if (!receipt.ok) emitFailure(receipt.diagnostics, { citationsVerified: receipt.citationsVerified });
  process.stdout.write(asJson
    ? `${JSON.stringify({ schemaVersion: 1, ...receipt }, null, 2)}\n`
    : `${receipt.artifact}\n${receipt.diagnostics.map((d) => `${d.severity}: ${d.code}: ${d.message}\n  fix: ${d.supportedFixes[0] || 'none offered'}`).join('\n')}${receipt.diagnostics.length ? '\n' : ''}`);
}
