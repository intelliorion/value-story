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
const GENERATED = 'generated/validate-value-case.mjs';

test('the compiled validator is in sync with schemas/', () => {
  const out = mkdtempSync(join(tmpdir(), 'vs-generated-'));
  try {
    execFileSync('node', ['scripts/generate-validators.mjs'],
      { cwd: root, stdio: 'pipe', env: { ...process.env, VS_OUTPUT_ROOT: out } });
    assert.equal(
      readFileSync(join(out, GENERATED), 'utf8'),
      readFileSync(join(root, GENERATED), 'utf8'),
      `${GENERATED} is stale relative to schemas/ — run \`npm run build:validators\` and commit the result`,
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('the compiled validator carries no runtime dependency', () => {
  const code = readFileSync(join(root, GENERATED), 'utf8');
  assert.ok(!code.includes('require('), 'generated validator must not require() anything');
  assert.ok(!/^import\s/m.test(code), 'generated validator must not import anything');
});

test('what `vs schema` prints is the schema the validator was built from', () => {
  const printed = execFileSync('node', [join(root, 'bin', 'vs.mjs'), 'schema']).toString();
  const onDisk = readFileSync(join(root, 'schemas', 'value-case.schema.json'), 'utf8');
  assert.equal(printed, onDisk,
    '`vs schema` must print the schema file the validator is generated from');
});
