#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCase } from '../src/render/render-case.mjs';
import { validateCase } from '../src/validate.mjs';
import { deliverCase } from '../src/deliver.mjs';
import { installDiagnosticBoundary, fallbackDiagnostic } from '../src/diagnostics.mjs';
import { ingestFile, ingestDir, outputName } from '../src/ingest/ingest.mjs';

installDiagnosticBoundary();

const HELP = {
  name: 'value-story',
  description: 'Turn a typed value-case JSON document into a validated, self-contained HTML value narrative.',
  contract: 'SKILL.md',
  commands: [
    { name: 'help', usage: 'vs help [--json]', description: 'Describe every command.' },
    { name: 'schema', usage: 'vs schema', description: 'Print the value-case JSON Schema.' },
    { name: 'render', usage: 'vs render <input.json> <output.html>', description: 'Render without validating. Use during visual iteration only.' },
    { name: 'validate', usage: 'vs validate <input.json> [--json]', description: 'Check schema, invariants and figure tracing. Returns a repair receipt on failure.' },
    { name: 'deliver', usage: 'vs deliver <input.json> <output.html> [--json]', description: 'Validate, then atomically write the artifact. Final acceptance.' },
    { name: 'ingest', usage: 'vs ingest <path...> --out <dir> [--json]', description: 'Extract readable text from documents (directories are read recursively) and print the manifest rows describing exactly what was read.' },
  ],
  receipt: {
    onFailure: 'JSON on stderr: { schemaVersion, ok:false, diagnostics:[{ code, severity, message, subject, evidence, supportedFixes }] }',
    supportedFixes: 'Each entry names a JSON Pointer into the input document. Apply one per repair round.',
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
for (let i = 0; i < rawArgv.length; i++) {
  const arg = rawArgv[i];
  if (arg === '--json') continue;
  if (arg === '--out') {
    const value = rawArgv[i + 1];
    if (value === undefined || value.startsWith('-')) {
      process.stderr.write('--out requires a directory argument: vs ingest <path...> --out <dir>\n');
      process.exit(1);
    }
    outDir = value;
    i++;
    continue;
  }
  if (arg === '-' || arg === '--' || arg.startsWith('-')) {
    process.stderr.write(`unrecognised argument: ${arg}\nonly --json and --out <dir> are supported flags.\n`);
    process.exit(1);
  }
  positional.push(arg);
}

const [command, input, output] = positional;

if (outDir !== null && command !== 'ingest') {
  process.stderr.write(`--out is only meaningful for vs ingest, not vs ${command || '(none)'}\n`);
  process.exit(1);
}

function emitFailure(diagnostics) {
  const receipt = { schemaVersion: 1, ok: false, diagnostics };
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
    characters: d.text.length,
    textFile: d.textFile,
    warnings: d.warnings,
  }));

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: true, out: outDir, documents: rows, skipped }, null, 2)}\n`);
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

if (command === 'render') {
  writeFileSync(output, renderCase(doc), 'utf8');
  process.stdout.write(`${output}\n`);
} else if (command === 'validate') {
  const result = validateCase(doc);
  if (!result.ok) emitFailure(result.diagnostics);
  process.stdout.write(asJson
    ? `${JSON.stringify({ schemaVersion: 1, ok: true, diagnostics: [] }, null, 2)}\n`
    : 'ok\n');
} else {
  const receipt = deliverCase(doc, output);
  if (!receipt.ok) emitFailure(receipt.diagnostics);
  process.stdout.write(asJson
    ? `${JSON.stringify({ schemaVersion: 1, ...receipt }, null, 2)}\n`
    : `${receipt.artifact}\n`);
}
