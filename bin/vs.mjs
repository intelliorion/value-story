#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderCase } from '../src/render/render-case.mjs';
import { validateCase } from '../src/validate.mjs';
import { deliverCase } from '../src/deliver.mjs';
import { installDiagnosticBoundary, fallbackDiagnostic } from '../src/diagnostics.mjs';

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
// treating it as a positional argument. The CLI understands only --json
// (plus --help/-h, handled above). This is itself a failure path: nothing
// useful goes to stdout, and stderr carries the diagnostic.
for (const arg of rawArgv) {
  if (arg === '--json') continue;
  if (arg === '-' || arg === '--' || arg.startsWith('-')) {
    process.stderr.write(`unrecognised argument: ${arg}\nonly --json is a supported flag.\n`);
    process.exit(1);
  }
}

const argv = rawArgv;
const [command, input, output] = argv.filter((a) => a !== '--json');

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
