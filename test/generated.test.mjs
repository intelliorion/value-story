// test/generated.test.mjs
//
// `vs schema` prints schemas/value-case.schema.json; src/validate.mjs
// validates against generated/validate-value-case.mjs. Those are two copies
// of one contract. Without this test, editing a schema and forgetting
// `npm run build:validators` leaves the suite green while an agent is handed
// a contract the validator rejects -- or accepts.
//
// The check regenerates into a scratch directory and compares bytes, so it
// never mutates the working tree: it must be able to fail twice in a row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Every module scripts/generate-validators.mjs emits. A schema that is
// compiled but not listed here can go stale unnoticed, which is the exact
// failure this file exists to prevent.
const GENERATED = [
  'generated/validate-value-case.mjs',
  'generated/validate-evidence-manifest.mjs',
];

test('the compiled validators are in sync with schemas/', () => {
  const out = mkdtempSync(join(tmpdir(), 'vs-generated-'));
  try {
    execFileSync('node', ['scripts/generate-validators.mjs'],
      { cwd: root, stdio: 'pipe', env: { ...process.env, VS_OUTPUT_ROOT: out } });
    for (const module of GENERATED) {
      assert.equal(
        readFileSync(join(out, module), 'utf8'),
        readFileSync(join(root, module), 'utf8'),
        `${module} is stale relative to schemas/ — run \`npm run build:validators\` and commit the result`,
      );
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the compiled validators carry no runtime dependency', () => {
  for (const module of GENERATED) {
    const code = readFileSync(join(root, module), 'utf8');
    assert.ok(!code.includes('require('), `${module} must not require() anything`);
    assert.ok(!/^import\s/m.test(code), `${module} must not import anything`);
  }
});

test('what `vs schema` prints is the schema the validator was built from', () => {
  const printed = JSON.parse(execFileSync('node', [join(root, 'bin', 'vs.mjs'), 'schema']).toString());
  const common = JSON.parse(readFileSync(join(root, 'schemas', 'common.schema.json'), 'utf8'));
  const expected = JSON.parse(readFileSync(join(root, 'schemas', 'value-case.schema.json'), 'utf8')
    .replaceAll('common.schema.json#/$defs/', '#/$defs/'));
  expected.$defs = common.$defs;
  assert.deepEqual(printed, expected,
    '`vs schema` must print the schema the validator is generated from, with the shared definitions resolved');
});

// SKILL.md sends an author to `vs schema` and the fixture and nothing else.
// Anything they must not guess has to be reachable from that one command.
test('`vs schema` is self-contained: nothing it prints points at a file the author was not told to read', () => {
  const printed = execFileSync('node', [join(root, 'bin', 'vs.mjs'), 'schema']).toString();
  assert.ok(!printed.includes('common.schema.json'),
    '`vs schema` must resolve its $refs, not send the author to another file');
  const parsed = JSON.parse(printed);
  const drivers = parsed.$defs?.driver?.enum;
  assert.ok(Array.isArray(drivers) && drivers.length === 10,
    'the closed driver enumeration must be visible in what `vs schema` prints');
  assert.ok(parsed.$defs?.date?.pattern && parsed.$defs?.period?.pattern,
    'the date and period patterns must be visible in what `vs schema` prints');
});
