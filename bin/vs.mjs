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

// Addition 1: reject any unrecognised flag rather than silently treating it
// as a positional argument. The only flag this CLI understands is --json.
for (const arg of rawArgv) {
  if (arg === '--json') continue;
  if (arg === '-' || arg === '--' || arg.startsWith('-')) {
    process.stderr.write(`unrecognised argument: ${arg}\nonly --json is a supported flag.\n`);
    process.exit(1);
  }
}

const argv = rawArgv;
const asJson = argv.includes('--json');
const [command, input, output] = argv.filter((a) => a !== '--json');

function emitFailure(diagnostics) {
  const receipt = { schemaVersion: 1, ok: false, diagnostics };
  process.stderr.write(asJson
    ? `${JSON.stringify(receipt, null, 2)}\n`
    : `${diagnostics.map((d) => `${d.code}: ${d.message}\n  fix: ${d.supportedFixes[0] || 'none offered'}`).join('\n')}\n`);
  process.exit(1);
}

function printHelp() {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(HELP, null, 2)}\n`);
    return;
  }
  const lines = HELP.commands.map((c) => `  ${c.usage.padEnd(46)} ${c.description}`);
  process.stdout.write(`${HELP.description}\n\n${lines.join('\n')}\n`);
}

if (!command || command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'schema') {
  const path = fileURLToPath(new URL('../schemas/value-case.schema.json', import.meta.url));
  process.stdout.write(readFileSync(path, 'utf8'));
  process.exit(0);
}

if (!['render', 'validate', 'deliver'].includes(command) || !input
    || ((command === 'render' || command === 'deliver') && !output)) {
  printHelp();
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
