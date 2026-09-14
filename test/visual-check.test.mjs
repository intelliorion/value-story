import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { visualCheck, VIEWPORTS } from '../scripts/visual-check.mjs';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));

// Everything this suite measures is a SYNTHETIC page written to a temp dir.
// The gate is an independent instrument: pointing its unit tests at a project
// artifact would mean a legitimate design change breaks the gate, and the gate
// would stop being able to tell us anything about the design.
const FITS = `<!doctype html><meta charset="utf-8"><title>fits</title>
<style>*{margin:0;padding:0}body{font:16px system-ui}
.wrap{max-width:900px;margin:0 auto;padding:24px}</style>
<div class="wrap"><h1>Fits</h1><p>Nothing here is wider than the window.</p></div>`;

// 3000px of deliberate horizontal overflow, in an element that can be named.
const OVERFLOWS = `<!doctype html><meta charset="utf-8"><title>overflows</title>
<style>*{margin:0;padding:0}body{font:16px system-ui}
#offender{width:3000px;height:80px;background:#ccc}</style>
<div class="wrap"><h1>Overflows</h1><div id="offender" class="too-wide">wide</div></div>`;

// Tall but never wide. A long narrative is EXPECTED to scroll down; if this
// produced a finding the gate would fail every real artifact it ever sees.
const TALL = `<!doctype html><meta charset="utf-8"><title>tall</title>
<style>*{margin:0;padding:0}body{font:16px system-ui}
.wrap{max-width:900px;margin:0 auto}.block{height:1200px;background:#eee;margin-bottom:24px}</style>
<div class="wrap"><div class="block">1</div><div class="block">2</div><div class="block">3</div></div>`;

const dir = mkdtempSync(join(tmpdir(), 'vs-visual-'));
const fitsPath = join(dir, 'fits.html');
const overflowPath = join(dir, 'overflows.html');
const tallPath = join(dir, 'tall.html');
writeFileSync(fitsPath, FITS, 'utf8');
writeFileSync(overflowPath, OVERFLOWS, 'utf8');
writeFileSync(tallPath, TALL, 'utf8');

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// Launching a browser is the expensive part of this suite, so ONE browser is
// shared by every direct-API test here. `visualCheck` reuses a single browser
// across its three viewports for the same reason.
let shared = null;
before(async () => {
  const { chromium } = await import('playwright');
  shared = await chromium.launch();
});
after(async () => {
  if (shared) await shared.close();
});

test('a page that fits produces no findings at any viewport', async () => {
  const result = await visualCheck(fitsPath, { browser: shared });
  assert.equal(result.ok, true, `expected ok, got findings: ${JSON.stringify(result.findings)}`);
  assert.deepEqual(result.findings, []);
  assert.equal(result.viewports.length, 3);
});

test('vertical scrolling is not a finding', async () => {
  const result = await visualCheck(tallPath, { browser: shared });
  assert.equal(result.ok, true, `expected ok, got findings: ${JSON.stringify(result.findings)}`);
  assert.deepEqual(result.findings, []);
});

test('a 3000px element is a finding at every viewport, measured in pixels and named', async () => {
  const result = await visualCheck(overflowPath, { browser: shared });
  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 3, 'one finding per viewport');

  for (const viewport of VIEWPORTS) {
    const finding = result.findings.find((f) => f.subject.viewport === `${viewport.width}x${viewport.height}`);
    assert.ok(finding, `no finding for ${viewport.width}x${viewport.height}`);

    // A measurement, not an adjective.
    assert.equal(typeof finding.evidence.overflowPx, 'number');
    assert.equal(finding.evidence.overflowPx, 3000 - viewport.width);
    assert.equal(finding.evidence.scrollWidth, 3000);
    assert.equal(finding.evidence.viewportWidth, viewport.width);

    // A finding that says "something overflows" without saying WHAT is not
    // actionable, so the selector must identify the offending element.
    assert.match(finding.subject.selector, /#offender/);
    assert.match(finding.message, new RegExp(String(3000 - viewport.width)));

    // Shaped for src/diagnostics.mjs so Task 22's conversion is a rename.
    assert.equal(finding.code, 'visual/horizontal-overflow');
    assert.equal(finding.severity, 'error');
    assert.ok(finding.supportedFixes.length > 0);
  }
});

test('graduated fixes: the advice scales with how far over the page is', async () => {
  const slight = join(dir, 'slight.html');
  writeFileSync(slight, `<!doctype html><meta charset="utf-8"><title>slight</title>
<style>*{margin:0;padding:0}</style><div id="a" style="width:1480px;height:40px"></div>`, 'utf8');
  const result = await visualCheck(slight, { browser: shared, viewports: [{ width: 1440, height: 900 }] });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].evidence.overflowPx, 40);
  assert.match(result.findings[0].supportedFixes.join(' '), /do not remove content/i);
});

test('the delivered file is never modified: the hash matches before and after', async () => {
  const before = sha256(overflowPath);
  await visualCheck(overflowPath, { browser: shared, viewports: [{ width: 1440, height: 900 }] });
  assert.equal(sha256(overflowPath), before);
  // And the gate itself asserts it, rather than trusting that it behaved.
  const result = await visualCheck(fitsPath, { browser: shared, viewports: [{ width: 1440, height: 900 }] });
  assert.equal(result.sha256, sha256(fitsPath));
});

test('a missing file fails with a message naming the file, not a stack trace', async () => {
  await assert.rejects(
    () => visualCheck(join(dir, 'absent.html'), { browser: shared }),
    (error) => {
      assert.match(error.message, /absent\.html/);
      assert.doesNotMatch(error.message, /\bat \w+.*\(.*:\d+:\d+\)/);
      return true;
    },
  );
});

test('an absent Playwright is reported as an actionable install instruction', async () => {
  const notFound = Object.assign(new Error("Cannot find package 'playwright'"), {
    code: 'ERR_MODULE_NOT_FOUND',
  });
  await assert.rejects(
    () => visualCheck(fitsPath, { loadPlaywright: () => Promise.reject(notFound) }),
    (error) => {
      assert.match(error.message, /playwright/i);
      assert.match(error.message, /npm install --save-dev playwright/);
      // Never a stack trace leaking Node's module resolver at the user.
      assert.doesNotMatch(error.message, /ERR_MODULE_NOT_FOUND/);
      return true;
    },
  );
});

// --- CLI ------------------------------------------------------------------
// The discipline every other command in bin/vs.mjs is held to: failures go to
// stderr with a non-zero exit and NOTHING on stdout.

test('vs visual-check exits 0 with the report on stdout for a page that fits', () => {
  const stdout = execFileSync('node', [CLI, 'visual-check', fitsPath, '--json'], { stdio: 'pipe' }).toString();
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.ok, true);
  assert.deepEqual(receipt.findings, []);
  assert.equal(receipt.schemaVersion, 1);
});

test('vs visual-check exits non-zero with findings on stderr and nothing on stdout', () => {
  try {
    execFileSync('node', [CLI, 'visual-check', overflowPath, '--json'], { stdio: 'pipe' });
    assert.fail('expected a non-zero exit when the artifact overflows');
  } catch (error) {
    assert.notEqual(error.status, 0);
    assert.equal(error.stdout.toString(), '', 'nothing may reach stdout on a failure');
    const stderr = error.stderr.toString();
    const receipt = JSON.parse(stderr);
    assert.equal(receipt.ok, false);
    assert.equal(receipt.findings.length, 3);
    assert.match(stderr, /1560/); // 3000 - 1440, the measurement
  }
});

test('vs visual-check on a missing file fails cleanly', () => {
  try {
    execFileSync('node', [CLI, 'visual-check', join(dir, 'nope.html')], { stdio: 'pipe' });
    assert.fail('expected a non-zero exit for a missing artifact');
  } catch (error) {
    assert.notEqual(error.status, 0);
    assert.equal(error.stdout.toString(), '');
    assert.match(error.stderr.toString(), /nope\.html/);
  }
});

test('vs visual-check without a path fails with usage', () => {
  try {
    execFileSync('node', [CLI, 'visual-check'], { stdio: 'pipe' });
    assert.fail('expected a non-zero exit with no path');
  } catch (error) {
    assert.notEqual(error.status, 0);
    assert.equal(error.stdout.toString(), '');
    assert.match(error.stderr.toString(), /visual-check/);
  }
});

test('visual-check is listed in vs help', () => {
  const stdout = execFileSync('node', [CLI, 'help', '--json'], { stdio: 'pipe' }).toString();
  const help = JSON.parse(stdout);
  assert.ok(help.commands.some((c) => c.name === 'visual-check'));
});
