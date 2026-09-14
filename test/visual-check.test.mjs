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
    assert.equal(finding.code, 'layout/overflow');
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

// --- Task 21: contrast, collision, above-the-fold -------------------------
// Each check gets its OWN synthetic pass fixture and fail fixture. None of
// them is a project artifact: a gate whose unit tests are pinned to the
// current design cannot report on the current design.

const SMALL = [{ width: 1440, height: 900 }];
const write = (name, html) => {
  const p = join(dir, name);
  writeFileSync(p, html, 'utf8');
  return p;
};

// CONTRAST -----------------------------------------------------------------
// #5A616B on #0A0B0D is 3.15:1 — below 4.5 for normal text, above 3 for
// large. Both fixtures use it, so the pass/fail difference is the WCAG
// large-text rule itself and nothing else.
const CONTRAST_PASS = write('contrast-pass.html', `<!doctype html><meta charset="utf-8"><title>contrast pass</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
p{margin:0 0 24px}
.band{background:linear-gradient(180deg,#14161A 0%,#0A0B0D 100%);padding:24px}
.large{font-size:24px;color:#5A616B}
.boldish{font-size:18.66px;font-weight:700;color:#5A616B}
</style>
<p class="body">Body text at the page ground.</p>
<div class="band"><p class="over-band">Text sitting on the gradient band.</p></div>
<p class="large">Large text at exactly 24px</p>
<p class="boldish">Bold text at exactly 18.66px</p>
<div class="empty"></div>`);

const CONTRAST_FAIL = write('contrast-fail.html', `<!doctype html><meta charset="utf-8"><title>contrast fail</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
p{margin:0 0 24px}
.dim{color:#5A616B}
.band{background:linear-gradient(180deg,#F4F5F7 0%,#FFFFFF 100%);padding:24px}
.small-bold{font-size:18.5px;font-weight:700;color:#5A616B}
</style>
<p class="dim">Dim body text at 16px.</p>
<div class="band"><p class="on-band">Light text on a light band.</p></div>
<p class="small-bold">Bold but under 18.66px</p>
<div class="empty"></div>`);

// NOTE ON THIS TEST'S LIMITS. On its own it is vacuous: with contrast output
// disabled entirely it still passes, because a check that reports nothing
// reports no false positives either. It is a guard against OVER-reporting and
// nothing more. What keeps contrast honest is the three paired positive
// controls below — each fails loudly if the check stops firing — and the fail
// fixture they read from. Do not mistake this one green tick for the thing
// holding the check up.
test('contrast: a page whose text clears the WCAG thresholds produces no finding', async () => {
  const result = await visualCheck(CONTRAST_PASS, { browser: shared, viewports: SMALL });
  const contrast = result.findings.filter((f) => f.code === 'layout/contrast');
  assert.deepEqual(contrast, [], `unexpected contrast findings: ${JSON.stringify(contrast, null, 2)}`);
});

test('contrast: normal text below 4.5:1 is a finding naming both colours and the ratio', async () => {
  const result = await visualCheck(CONTRAST_FAIL, { browser: shared, viewports: SMALL });
  const contrast = result.findings.filter((f) => f.code === 'layout/contrast');
  assert.ok(contrast.length > 0, 'expected a contrast finding');

  const dim = contrast.find((f) => /\.dim/.test(f.subject.selector));
  assert.ok(dim, `no finding for .dim: ${JSON.stringify(contrast.map((f) => f.subject.selector))}`);
  assert.equal(dim.severity, 'error');
  assert.equal(dim.evidence.threshold, 4.5);
  assert.ok(Math.abs(dim.evidence.ratio - 3.15) < 0.02, `ratio was ${dim.evidence.ratio}`);
  assert.match(dim.evidence.color, /90|5a616b/i);
  assert.match(dim.evidence.background, /10|0a0b0d/i);
  assert.match(dim.message, /3\.1/);
});

test('contrast: the 18.66px bold boundary is the real WCAG rule, not a rounded one', async () => {
  const pass = await visualCheck(CONTRAST_PASS, { browser: shared, viewports: SMALL });
  assert.equal(
    pass.findings.filter((f) => f.code === 'layout/contrast' && /boldish/.test(f.subject.selector)).length,
    0,
    '18.66px bold is large text and 3.15:1 clears the 3:1 threshold',
  );
  const fail = await visualCheck(CONTRAST_FAIL, { browser: shared, viewports: SMALL });
  const small = fail.findings.find((f) => f.code === 'layout/contrast' && /small-bold/.test(f.subject.selector));
  assert.ok(small, '18.5px bold is NOT large text and 3.15:1 fails the 4.5:1 threshold');
  assert.equal(small.evidence.threshold, 4.5);
});

test('contrast: the background is resolved by walking ancestors, not assumed to be body', async () => {
  const result = await visualCheck(CONTRAST_FAIL, { browser: shared, viewports: SMALL });
  const onBand = result.findings.find((f) => f.code === 'layout/contrast' && /on-band/.test(f.subject.selector));
  // Against body (#0A0B0D) this text is 18:1 and would never be reported.
  // It is only a finding because the effective background is the band.
  assert.ok(onBand, 'text over a light band must be measured against the band');
  assert.equal(onBand.evidence.backgroundKind, 'gradient');
  assert.ok(onBand.evidence.ratio < 1.3, `ratio was ${onBand.evidence.ratio}`);
  assert.match(onBand.evidence.backgroundSelector, /band/);
});

// THE ELEMENT'S OWN BACKGROUND.
//
// Every fixture above puts the background on an ANCESTOR, which is why three
// review passes missed that the walk started at `el.parentElement`. These two
// put it on the text element itself:
//
//  - `.own-white` is white text on its own white card. Measured from the
//    parent it resolved to `body` (#0A0B0D) and computed 21:1 -- a clean pass,
//    no finding, and no skip either.
//  - `.own-conic` carries a conic-gradient this check cannot map. Measured
//    from the parent it was not skipped at all: it was compared against an
//    ancestor it never sits on, and the finding said "resolved from body" --
//    a fabricated measurement presented as a real one.
const OWN_BACKGROUND = write('own-background.html', `<!doctype html><meta charset="utf-8"><title>own background</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
p{margin:0 0 24px}
.own-white{background:#FFFFFF;color:#FFFFFF;padding:16px}
.own-conic{background:conic-gradient(#000000,#FFFFFF);padding:16px}
.own-dark{background:#0A0B0D;color:#F4F5F7;padding:16px}
</style>
<p class="own-white">White text on its own white card.</p>
<p class="own-conic">Text on its own conic gradient.</p>
<p class="own-dark">Readable text on its own dark card.</p>`);

test('contrast: white text on the element’s OWN white background is a finding', async () => {
  const result = await visualCheck(OWN_BACKGROUND, { browser: shared, viewports: SMALL });
  const finding = result.findings.find((f) => f.code === 'layout/contrast' && /own-white/.test(f.subject.selector));
  assert.ok(finding, `expected a finding for .own-white, got ${JSON.stringify(result.findings.map((f) => f.subject.selector))}`);
  // 1:1, not the 21:1 that resolving to `body` produced.
  assert.ok(finding.evidence.ratio < 1.05, `ratio was ${finding.evidence.ratio}`);
  assert.equal(finding.evidence.backgroundKind, 'color');
  assert.match(finding.evidence.backgroundSelector, /own-white/);
});

test('contrast: an element’s OWN unresolvable gradient is SKIPPED with a reason, never measured against an ancestor', async () => {
  const result = await visualCheck(OWN_BACKGROUND, { browser: shared, viewports: SMALL });
  const measured = result.findings.filter((f) => f.code === 'layout/contrast' && /own-conic/.test(f.subject.selector));
  assert.deepEqual(measured, [],
    'a background this check cannot map must never be replaced by an ancestor\'s colour');

  const skipped = result.viewports[0].contrast.skipped.filter((sk) => /own-conic/.test(sk.selector));
  assert.equal(skipped.length, 1, JSON.stringify(result.viewports[0].contrast.skipped, null, 2));
  assert.match(skipped[0].reason, /background is an image this check does not resolve/);
});

test('contrast: an element with its own readable background still passes', async () => {
  const result = await visualCheck(OWN_BACKGROUND, { browser: shared, viewports: SMALL });
  const dark = result.findings.filter((f) => f.code === 'layout/contrast' && /own-dark/.test(f.subject.selector));
  assert.deepEqual(dark, [], 'an element whose own background is readable must not become a false positive');
});

// --- Fix 6/7: skips and caps are disclosed, never silent -------------------

// A page whose ONLY text sits on an unresolvable background. Before this, it
// printed "no horizontal overflow at 3 viewport(s)", exited 0, and reported
// summary {reported:0,total:0,truncated:0} -- "nothing was measured" wearing
// the face of "nothing measured wrong".
const ALL_SKIPPED = write('all-skipped.html', `<!doctype html><meta charset="utf-8"><title>all skipped</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;font:16px/1.5 system-ui}
.only{background:conic-gradient(#000000,#FFFFFF);color:#FFFFFF;padding:16px}</style>
<p class="only">The only text on this page.</p>`);

test('a page where NOTHING could be measured says so in summary, and is not a silent pass', async () => {
  const result = await visualCheck(ALL_SKIPPED, { browser: shared, viewports: SMALL });
  assert.equal(result.ok, true, 'no finding fired, which is true and is not the whole truth');
  assert.equal(result.summary.reported, 0);

  const contrast = result.summary.measured.contrast;
  assert.equal(contrast.reported, 0, 'nothing was measured for contrast');
  assert.ok(contrast.total > 0, 'but there WAS text to measure');
  assert.equal(contrast.skipped, contrast.total);
  assert.ok(contrast.reasons.length > 0);
  assert.match(contrast.reasons[0].reason, /background is an image/);
});

test('the human path surfaces the skips in the same "reported of total" idiom', () => {
  const stdout = execFileSync('node', [CLI, 'visual-check', ALL_SKIPPED], { stdio: 'pipe', encoding: 'utf8' });
  assert.match(stdout, /contrast: 0 of \d+ text element\(s\) measured, \d+ skipped\./);
  assert.match(stdout, /skipped because .*background is an image/);
});

test('a page where everything WAS measured says so too', async () => {
  const result = await visualCheck(CONTRAST_PASS, { browser: shared, viewports: SMALL });
  const contrast = result.summary.measured.contrast;
  assert.ok(contrast.total > 0);
  assert.equal(contrast.skipped, 0);
  assert.equal(contrast.reported, contrast.total);
  // And the text-element cap discloses itself the same way every other cap does.
  const text = result.summary.measured.textElements;
  assert.equal(text.reported, text.total);
  assert.equal(text.truncated, 0);
});

test('the text-element cap discloses what it withheld rather than stopping silently', async () => {
  const many = write('many-text.html', `<!doctype html><meta charset="utf-8"><title>many text</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
p{margin:0}</style>
${Array.from({ length: 650 }, (_, i) => `<p class="t">line ${i}</p>`).join('\n')}`);
  const result = await visualCheck(many, { browser: shared, viewports: SMALL });
  const text = result.summary.measured.textElements;
  assert.equal(text.reported, 600, 'the cap itself is unchanged');
  assert.ok(text.total >= 650, `total was ${text.total}`);
  assert.equal(text.truncated, text.total - text.reported);
  assert.ok(text.truncated > 0, 'this fixture must actually exceed the cap');
});

test('the contrast SKIP list is capped, and the cap is disclosed', async () => {
  const many = write('many-skips.html', `<!doctype html><meta charset="utf-8"><title>many skips</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;font:16px/1.5 system-ui}
p{background:conic-gradient(#000000,#FFFFFF);color:#FFFFFF;margin:0}</style>
${Array.from({ length: 30 }, (_, i) => `<p class="s">line ${i}</p>`).join('\n')}`);
  const result = await visualCheck(many, { browser: shared, viewports: SMALL });
  const contrast = result.summary.measured.contrast;
  assert.equal(contrast.skipped, 30);
  assert.equal(contrast.listed, 20, 'the skip list cap itself is unchanged');
  assert.equal(result.viewports[0].contrast.skippedTotal, 30);
  assert.equal(result.viewports[0].contrast.skippedTruncated, 10);
});

test('contrast: an element with no rendered text is never a finding', async () => {
  const result = await visualCheck(CONTRAST_FAIL, { browser: shared, viewports: SMALL });
  const empty = result.findings.filter((f) => /\.empty/.test(f.subject.selector || ''));
  assert.deepEqual(empty, [], 'an empty div has no contrast problem');
});

// COLLISION ----------------------------------------------------------------
const COLLIDE_PASS = write('collide-pass.html', `<!doctype html><meta charset="utf-8"><title>collide pass</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
.card{padding:16px;margin-bottom:24px}
.wrapped{width:220px;margin-bottom:24px}
.near-a{position:absolute;left:0;top:600px;width:100px}
.near-b{position:absolute;left:98px;top:600px;width:100px}
</style>
<div class="card">Parent card text that sits around its child.
  <p class="inner">A nested paragraph whose box is entirely inside its parent.</p>
</div>
<p class="wrapped"><span class="one">alpha bravo charlie delta echo</span> <span class="two">foxtrot golf hotel india</span></p>
<p class="after">A paragraph after everything else.</p>
<div class="near-a">left</div><div class="near-b">right</div>`);

const COLLIDE_FAIL = write('collide-fail.html', `<!doctype html><meta charset="utf-8"><title>collide fail</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
#alpha{position:absolute;left:40px;top:40px;width:300px;height:100px}
#bravo{position:absolute;left:100px;top:80px;width:300px;height:100px}
</style>
<div id="alpha">Alpha label</div><div id="bravo">Bravo label</div>`);

test('collision: a parent containing a text-bearing child is NOT a collision', async () => {
  const result = await visualCheck(COLLIDE_PASS, { browser: shared, viewports: SMALL });
  const hits = result.findings.filter((f) => f.code === 'layout/collision');
  assert.deepEqual(hits, [], `ancestor/descendant pairs must be excluded: ${JSON.stringify(hits, null, 2)}`);
});

test('collision: two overlapping text boxes are a finding with both selectors and the rectangle', async () => {
  const result = await visualCheck(COLLIDE_FAIL, { browser: shared, viewports: SMALL });
  const hits = result.findings.filter((f) => f.code === 'layout/collision');
  assert.equal(hits.length, 1, `expected exactly one collision: ${JSON.stringify(hits, null, 2)}`);
  const [hit] = hits;
  const both = `${hit.evidence.a} ${hit.evidence.b}`;
  assert.match(both, /#alpha/);
  assert.match(both, /#bravo/);
  assert.equal(hit.evidence.overlap.width, 240);
  assert.equal(hit.evidence.overlap.height, 60);
  assert.equal(hit.severity, 'error');
  assert.ok(hit.supportedFixes.length > 0);
});

// ABOVE THE FOLD -----------------------------------------------------------
const HERO = '<p class="vs-hero__figures"><span>41%</span> &rarr; <span>12%</span></p>';
const FOLD_PASS = write('fold-pass.html', `<!doctype html><meta charset="utf-8"><title>fold pass</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
.vs-hero__figures{font-size:64px;padding:40px}.rest{height:2400px}</style>
${HERO}<div class="rest"></div>`);

const FOLD_FAIL = write('fold-fail.html', `<!doctype html><meta charset="utf-8"><title>fold fail</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
.push{height:1200px}.vs-hero__figures{font-size:64px}</style>
<div class="push"></div>${HERO}`);

const FOLD_NONE = write('fold-none.html', `<!doctype html><meta charset="utf-8"><title>no hero</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}</style>
<h1>An outcome carried entirely by qualitative claims.</h1>
<p>There is no hero delta on this page, and that is correct.</p>`);

test('above the fold: a hero inside the first screen produces no finding', async () => {
  const result = await visualCheck(FOLD_PASS, { browser: shared });
  const hits = result.findings.filter((f) => f.code === 'layout/hero-below-fold');
  assert.deepEqual(hits, [], JSON.stringify(result.findings, null, 2));
});

test('above the fold: a hero past every first screen is a finding at every viewport, each naming its own', async () => {
  const result = await visualCheck(FOLD_FAIL, { browser: shared });
  const hits = result.findings.filter((f) => f.code === 'layout/hero-below-fold');
  assert.equal(hits.length, 3, 'the fold is evaluated at EVERY checked size, not only the smallest');

  for (const viewport of VIEWPORTS) {
    const label = `${viewport.width}x${viewport.height}`;
    const hit = hits.find((f) => f.subject.viewport === label);
    // A finding that can fire at one size and not another is useless unless it
    // says WHICH size it fired at.
    assert.ok(hit, `no fold finding for ${label}`);
    assert.match(hit.message, new RegExp(label.replace('x', 'x')));
    assert.equal(hit.evidence.viewportHeight, viewport.height);
    assert.equal(hit.evidence.innerHeight, viewport.height);
    assert.ok(hit.evidence.bottom > viewport.height, `bottom was ${hit.evidence.bottom}`);
    assert.equal(hit.evidence.overshootPx, hit.evidence.bottom - viewport.height);
  }
});

test('above the fold: the fold is a per-viewport judgement, and fires only where it is true', async () => {
  // 930px of hero: past the 900px first screen, inside the 1000px and 1080px
  // ones. Checking only the smallest would still catch this; checking only the
  // largest would miss it. The point is that each size is judged on its own
  // measurement rather than on an assumption about how the CSS reflows.
  const partial = write('fold-partial.html', `<!doctype html><meta charset="utf-8"><title>fold partial</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
.push{height:850px}.vs-hero__figures{font-size:64px;height:80px}.rest{height:1800px}</style>
<div class="push"></div>${HERO}<div class="rest"></div>`);

  const result = await visualCheck(partial, { browser: shared });
  const hits = result.findings.filter((f) => f.code === 'layout/hero-below-fold');
  assert.equal(hits.length, 1, `expected one: ${JSON.stringify(hits.map((h) => h.subject.viewport))}`);
  assert.equal(hits[0].subject.viewport, '1440x900');
  assert.equal(hits[0].evidence.bottom, 930);

  // And every viewport was actually MEASURED, not merely skipped into silence.
  assert.equal(result.viewports.length, 3);
  for (const v of result.viewports) {
    assert.equal(v.hero.present, true, `${v.viewport} did not evaluate the hero`);
    assert.equal(v.hero.bottom, 930);
    assert.equal(v.hero.innerHeight, v.innerHeight);
  }
});

test('above the fold: no hero is SKIPPED with a reason at every viewport, never a failure', async () => {
  const result = await visualCheck(FOLD_NONE, { browser: shared });
  assert.equal(result.ok, true, JSON.stringify(result.findings, null, 2));
  assert.equal(result.viewports.length, 3);
  // The skip is recorded at EVERY size now that every size is evaluated —
  // three silences with a reason, not one silence and two blanks.
  for (const v of result.viewports) {
    assert.equal(v.hero.present, false, `${v.viewport}`);
    assert.match(v.hero.reason, /no element matches \.vs-hero__figures/);
  }
});

test('the three new checks share the one browser the gate already launched', async () => {
  // A single visualCheck call over three viewports opens three contexts on the
  // SAME browser; it never launches one per check.
  const result = await visualCheck(CONTRAST_PASS, { browser: shared });
  assert.equal(result.viewports.length, 3);
  assert.equal(shared.contexts().length, 0, 'every context is closed again');
});

test('collision: the parent/child exclusion is what suppresses it, not the geometry', async () => {
  // The same two boxes at the same coordinates, once nested and once as
  // siblings. If the nested case were silent because the boxes happen not to
  // overlap, the sibling case would be silent too and the exclusion above
  // would be proving nothing.
  const geometry = `<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#F4F5F7;font:16px/1.5 system-ui}
#outer{position:absolute;left:0;top:0;width:400px;height:200px}
#inner{position:absolute;left:20px;top:20px;width:300px;height:100px}</style>`;
  const nested = write('contain-nested.html', `<!doctype html><meta charset="utf-8"><title>nested</title>
${geometry}<div id="outer">Outer text<div id="inner">Inner text</div></div>`);
  const siblings = write('contain-siblings.html', `<!doctype html><meta charset="utf-8"><title>siblings</title>
${geometry}<div id="outer">Outer text</div><div id="inner">Inner text</div>`);

  const a = await visualCheck(nested, { browser: shared, viewports: SMALL });
  assert.deepEqual(a.findings.filter((f) => f.code === 'layout/collision'), [],
    'a descendant inside its ancestor is never a collision');

  const b = await visualCheck(siblings, { browser: shared, viewports: SMALL });
  const hits = b.findings.filter((f) => f.code === 'layout/collision');
  assert.equal(hits.length, 1, 'the identical geometry, un-nested, IS a collision');
  assert.equal(hits[0].evidence.overlap.width, 300);
});

// --- Task 22: the repair receipt ------------------------------------------
// The gate's findings are the project's standard diagnostic envelope, in the
// `layout/` namespace spec §5.1 names, carrying graduated fixes that say what
// NOT to do and a truncation disclosure a consumer cannot miss.

const ENVELOPE = ['code', 'severity', 'message', 'subject', 'evidence', 'supportedFixes'];
const LAYOUT_CODES = new Set([
  'layout/overflow', 'layout/collision', 'layout/contrast', 'layout/hero-below-fold',
]);

// One page that trips every check at once, so the envelope assertions run over
// all four codes rather than over whichever one happens to be cheapest.
const ALL_FOUR = write('all-four.html', `<!doctype html><meta charset="utf-8"><title>all four</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#5A616B;font:16px/1.5 system-ui}
#wide{width:3000px;height:40px}
#alpha{position:absolute;left:40px;top:400px;width:300px;height:100px}
#bravo{position:absolute;left:100px;top:440px;width:300px;height:100px}
.push{height:1200px}.vs-hero__figures{font-size:64px}</style>
<div id="wide">wide</div><p class="dim">Dim text.</p>
<div id="alpha">Alpha label</div><div id="bravo">Bravo label</div>
<div class="push"></div>${HERO}`);

test('every finding is the standard diagnostic envelope in the layout/ namespace', async () => {
  const result = await visualCheck(ALL_FOUR, { browser: shared, viewports: SMALL });
  assert.ok(result.findings.length > 0);

  const seen = new Set();
  for (const finding of result.findings) {
    seen.add(finding.code);
    assert.ok(LAYOUT_CODES.has(finding.code), `unexpected code: ${finding.code}`);
    // normalizedDiagnostic's shape exactly — no more keys, no fewer.
    assert.deepEqual(Object.keys(finding), ENVELOPE, `envelope drift on ${finding.code}`);
    assert.equal(finding.severity, 'error');
    assert.ok(finding.message.length > 0);
    assert.ok(finding.supportedFixes.length > 0);
    // An ADDRESS: a finding a reader cannot locate is not actionable.
    assert.equal(typeof finding.subject.selector, 'string');
    assert.ok(finding.subject.selector.length > 0, `empty selector on ${finding.code}`);
    assert.equal(finding.subject.viewport, '1440x900', `no viewport on ${finding.code}`);
  }
  assert.deepEqual([...seen].sort(), [...LAYOUT_CODES].sort(),
    `not every check fired: ${JSON.stringify([...seen])}`);
});

test('no finding still carries a visual/ code', async () => {
  const result = await visualCheck(ALL_FOUR, { browser: shared, viewports: SMALL });
  assert.deepEqual(result.findings.filter((f) => f.code.startsWith('visual/')), []);
});

// The three overflow bands. Each is measured from a page built to land inside
// it, because a band that never fires is a band nobody has checked.
const overflowBand = async (name, width) => {
  const path = write(name, `<!doctype html><meta charset="utf-8"><title>${name}</title>
<style>*{margin:0;padding:0}</style><div id="band" style="width:${width}px;height:40px">x</div>`);
  const result = await visualCheck(path, { browser: shared, viewports: SMALL });
  assert.equal(result.findings.length, 1, JSON.stringify(result.findings, null, 2));
  return result.findings[0];
};

test('overflow band 1: 20px over asks for a gap, and forbids removing content', async () => {
  const finding = await overflowBand('over-20.html', 1460);
  assert.equal(finding.evidence.overflowPx, 20);
  assert.equal(finding.evidence.band, '<=40px');
  const fixes = finding.supportedFixes.join('\n');
  assert.match(fixes, /tighten one gap or padding/);
  assert.match(fixes, /by 20-40px/);
  assert.match(fixes, /do not remove content/);
  assert.doesNotMatch(fixes, /next chapter/);
});

test('overflow band 2: 100px over moves an element, and forbids shrinking the hero', async () => {
  const finding = await overflowBand('over-100.html', 1540);
  assert.equal(finding.evidence.overflowPx, 100);
  assert.equal(finding.evidence.band, '41-200px');
  const fixes = finding.supportedFixes.join('\n');
  assert.match(fixes, /move a supporting element to the next chapter/);
  assert.match(fixes, /do not shrink the hero numeral/);
  assert.doesNotMatch(fixes, /tighten one gap or padding/);
});

test('overflow band 3: over 200px is reported as a wrong layout, not compressed', async () => {
  const finding = await overflowBand('over-400.html', 1840);
  assert.equal(finding.evidence.overflowPx, 400);
  assert.equal(finding.evidence.band, '>200px');
  const fixes = finding.supportedFixes.join('\n');
  assert.match(fixes, /the layout is wrong for this content/);
  assert.match(fixes, /report it rather than compressing/);
  assert.doesNotMatch(fixes, /tighten one gap or padding/);
});

test('the three bands are three different instructions, not one text', async () => {
  const [a, b, c] = await Promise.all([
    overflowBand('band-a.html', 1470),
    overflowBand('band-b.html', 1590),
    overflowBand('band-c.html', 2000),
  ]);
  const first = [a, b, c].map((f) => f.supportedFixes[0]);
  assert.equal(new Set(first).size, 3, `bands share wording: ${JSON.stringify(first, null, 2)}`);
});

// Every check says what NOT to do, not only overflow.
test('contrast points at the token file, never at a per-element override', async () => {
  const result = await visualCheck(CONTRAST_FAIL, { browser: shared, viewports: SMALL });
  const contrast = result.findings.find((f) => f.code === 'layout/contrast');
  const fixes = contrast.supportedFixes.join('\n');
  assert.match(fixes, /src\/render\/tokens\.mjs/);
  assert.match(fixes, /not a per-element override/);
});

test('collision and the fold each carry their own prohibition', async () => {
  const collide = await visualCheck(COLLIDE_FAIL, { browser: shared, viewports: SMALL });
  const hit = collide.findings.find((f) => f.code === 'layout/collision');
  assert.match(hit.supportedFixes.join('\n'), /do not/i);
  assert.ok(typeof hit.evidence.band === 'string' && hit.evidence.band.length > 0);

  const fold = await visualCheck(FOLD_FAIL, { browser: shared, viewports: SMALL });
  const below = fold.findings.find((f) => f.code === 'layout/hero-below-fold');
  assert.match(below.supportedFixes.join('\n'), /do not shrink the hero numeral/);
  assert.ok(typeof below.evidence.band === 'string' && below.evidence.band.length > 0);
});

// --- truncation disclosure -------------------------------------------------
// The cap is correct behaviour. Reporting the capped count as if it were the
// whole count is not: every artifact then looks equally bad.
const MANY = write('many-contrast.html', `<!doctype html><meta charset="utf-8"><title>many</title>
<style>*{margin:0;padding:0}body{background:#0A0B0D;color:#5A616B;font:16px/1.5 system-ui}
p{margin:0 0 8px}</style>
${Array.from({ length: 12 }, (_, i) => `<p class="dim-${i}">Dim line ${i}.</p>`).join('\n')}`);

test('truncation: the finding carries the true total, not just the capped count', async () => {
  const result = await visualCheck(MANY, { browser: shared, viewports: SMALL });
  const contrast = result.findings.filter((f) => f.code === 'layout/contrast');
  assert.equal(contrast.length, 5, 'the cap itself is unchanged');
  for (const finding of contrast) {
    assert.equal(finding.evidence.total, 12, 'the full count must travel with the finding');
    assert.equal(finding.evidence.reported, 5);
    assert.equal(finding.evidence.truncated, 7);
  }
});

test('truncation: the measurement payload carries total alongside truncated', async () => {
  const result = await visualCheck(MANY, { browser: shared, viewports: SMALL });
  assert.equal(result.viewports[0].contrast.total, 12);
  assert.equal(result.viewports[0].contrast.reported, 5);
  assert.equal(result.viewports[0].contrast.truncated, 7);
});

test('truncation: the receipt summarises reported against measured, per code', async () => {
  const result = await visualCheck(MANY, { browser: shared, viewports: SMALL });
  assert.equal(result.summary.reported, 5);
  assert.equal(result.summary.total, 12);
  assert.equal(result.summary.truncated, 7);
  const contrast = result.summary.byCode.find((c) => c.code === 'layout/contrast');
  assert.deepEqual(contrast, { code: 'layout/contrast', reported: 5, total: 12, truncated: 7 });
});

test('truncation: a run with nothing withheld reports total equal to reported', async () => {
  const result = await visualCheck(overflowPath, { browser: shared, viewports: SMALL });
  assert.equal(result.summary.reported, 1);
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.truncated, 0);
});

test('truncation: the human-readable CLI output says "5 of 12", never bare "5"', () => {
  try {
    execFileSync('node', [CLI, 'visual-check', MANY], { stdio: 'pipe' });
    assert.fail('expected a non-zero exit');
  } catch (error) {
    assert.notEqual(error.status, 0);
    const stderr = error.stderr.toString();
    // Three viewports x 12 failures measured, 5 reported at each.
    assert.match(stderr, /15 of 36 findings reported/);
    assert.match(stderr, /layout\/contrast: 15 of 36/);
  }
});

test('truncation: the JSON receipt carries the summary', () => {
  try {
    execFileSync('node', [CLI, 'visual-check', MANY, '--json'], { stdio: 'pipe' });
    assert.fail('expected a non-zero exit');
  } catch (error) {
    const receipt = JSON.parse(error.stderr.toString());
    assert.equal(receipt.summary.reported, 15);
    assert.equal(receipt.summary.total, 36);
    assert.equal(receipt.summary.truncated, 21);
  }
});
