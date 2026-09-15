# Value Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portable agent skill plus a zero-runtime-dependency Node renderer that turns a typed JSON description of an AI initiative into a validated, visually exceptional, self-contained HTML value narrative — usable from Claude Code, GitHub Copilot, or a bare terminal.

**Architecture:** A pure-function renderer composes an HTML string from a `value-case` JSON document; no DOM, no framework, no runtime dependencies. A separate validation layer (M1) checks the document against a JSON Schema plus semantic invariants, and emits machine-readable repair receipts whose `supportedFixes` are JSON Pointers. Delivery renders to a temporary path, verifies, then atomically renames over the target so a failed run never destroys a good artifact. The agent contract lives in one canonical `SKILL.md`; harness-specific adapters are generated from it.

**Tech Stack:** Node 23.5.0 (ESM, `.mjs`), built-in `node:test` runner, Ajv 8.20.0 **as a devDependency only** (standalone code generation emits dependency-free validator modules), Playwright at M3 only.

**Spec:** `docs/superpowers/specs/2026-09-13-value-story-design.md` (commit `6eaec6c`)

## Global Constraints

- **Node >= 22.** Developed on v23.5.0. ESM only; every source file is `.mjs`.
- **Zero runtime dependencies.** `package.json` `dependencies` must stay empty. Ajv appears only under `devDependencies`; its output is committed generated code.
- **No CDNs, no external fetches, no webfonts.** The artifact is one self-contained `.html` file that works offline. Font stacks are system fonts only.
- **Harness-agnostic.** Every capability is reachable through the `vs` CLI with `--json`. No behaviour may require a specific agent harness. `SKILL.md` is the single source of truth for the agent contract; all harness adapters are generated from it.
- **The renderer never authors a hex colour.** All colour, spacing, type and motion values come from `DESIGN.md` tokens surfaced as CSS custom properties.
- **Motion runs once on entry and resolves.** Nothing loops, pulses or bounces. `prefers-reduced-motion` is honored. The print path has zero motion and loses no meaning.
- **Dates are ISO 8601:** `YYYY-MM` for claim periods, `YYYY-MM-DD` for evidence dates.
- **The ten drivers are a closed enumeration.** Effectiveness: `productivity`, `operational-adaptability`, `governance-oversight`, `standardization-knowledge`, `high-value-skills-ip`, `differentiation`. Efficiency: `labor-cost-efficiency`, `process-cost-efficiency`, `overhead-cost-efficiency`, `capex-reduction`.
- **Claim tiers are `measured`, `estimated`, `qualitative`.** A `qualitative` claim may not carry numeric fields. An `estimated` claim must name an assumption owner.
- **Never describe a non-zero exit as success.**

---

## File Structure

```
value-story/
├── package.json                      # type:module, devDeps only, test + build scripts
├── DESIGN.md                         # M0 T2 — YAML token frontmatter + prose
├── FINGERPRINTS.md                   # M0 T7 — anti-pattern catalogue
├── SKILL.md                          # M1 T13 — canonical agent contract
├── .github/
│   ├── copilot-instructions.md       # M1 T14 — generated from SKILL.md
│   └── prompts/
│       └── value-story.prompt.md     # M1 T14 — generated; Copilot /value-story
├── bin/
│   └── vs.mjs                        # CLI: help | schema | render | validate | deliver
├── scripts/
│   ├── generate-validators.mjs       # M1 T9 — Ajv standalone codegen
│   └── generate-adapters.mjs         # M1 T14 — SKILL.md -> harness adapters
├── src/
│   ├── drivers.mjs                   # closed driver enumeration + labels + grouping
│   ├── render/
│   │   ├── tokens.mjs                # DESIGN.md tokens -> CSS custom properties
│   │   ├── html.mjs                  # escaping primitives + document shell
│   │   ├── claim-card.mjs            # tier-typed claim rendering + figure extraction
│   │   ├── delta.mjs                 # the hero delta
│   │   ├── constellation.mjs         # ten-driver constellation SVG
│   │   ├── chapters.mjs              # the fixed four-slot arc
│   │   └── render-case.mjs           # top-level composition
│   ├── diagnostics.mjs               # M1 — envelope, normalizer, suppression, boundary
│   ├── semantic.mjs                  # M1 — the five invariants
│   ├── reconcile.mjs                 # M1 — on-screen figure tracing
│   ├── validate.mjs                  # M1 — schema + semantic orchestration
│   └── deliver.mjs                   # M1 — atomic delivery
├── schemas/
│   ├── common.schema.json            # M1
│   └── value-case.schema.json        # M1
├── generated/
│   └── validate-value-case.mjs       # M1 — Ajv standalone output, committed
├── fixtures/
│   └── example.value-case.json       # M0 T7 — synthetic, doubles as test fixture
└── test/
    └── *.test.mjs
```

Rendering is split by **visual component**, not by technical layer, because components change together with their markup and styles. Each render module is a pure function returning an HTML string, independently testable without a browser.

---

# MILESTONE 0 — Prove the visual

No schemas, no validators. The goal is an artifact worth showing. The renderer built here survives into M1 unchanged; the fixture becomes the test corpus.

---

### Task 1: Project scaffold and the driver enumeration

**Files:**
- Create: `package.json`
- Create: `src/drivers.mjs`
- Test: `test/drivers.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `DRIVER_GROUPS: { effectiveness: string[], efficiency: string[] }`
  - `ALL_DRIVERS: string[]` — all ten ids, effectiveness first
  - `DRIVER_LABELS: Record<string, string>` — id to display label
  - `isDriver(id: string) => boolean`
  - `driverGroup(id: string) => 'effectiveness' | 'efficiency' | null`

- [ ] **Step 1: Write the failing test**

```javascript
// test/drivers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DRIVERS, DRIVER_GROUPS, DRIVER_LABELS, isDriver, driverGroup } from '../src/drivers.mjs';

test('exposes exactly ten drivers in two groups', () => {
  assert.equal(ALL_DRIVERS.length, 10);
  assert.equal(DRIVER_GROUPS.effectiveness.length, 6);
  assert.equal(DRIVER_GROUPS.efficiency.length, 4);
});

test('every driver has a display label', () => {
  for (const id of ALL_DRIVERS) {
    assert.equal(typeof DRIVER_LABELS[id], 'string', `missing label for ${id}`);
    assert.ok(DRIVER_LABELS[id].length > 0);
  }
});

test('effectiveness drivers come before efficiency drivers', () => {
  assert.equal(ALL_DRIVERS[0], 'productivity');
  assert.equal(ALL_DRIVERS[9], 'capex-reduction');
});

test('isDriver rejects anything outside the closed enumeration', () => {
  assert.equal(isDriver('productivity'), true);
  assert.equal(isDriver('cost-savings'), false);
  assert.equal(isDriver(''), false);
  assert.equal(isDriver(undefined), false);
});

test('driverGroup classifies and returns null for unknown ids', () => {
  assert.equal(driverGroup('governance-oversight'), 'effectiveness');
  assert.equal(driverGroup('capex-reduction'), 'efficiency');
  assert.equal(driverGroup('nonsense'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/drivers.test.mjs` from the repository root
Expected: FAIL — `Cannot find module '../src/drivers.mjs'`

- [ ] **Step 3: Write package.json and the implementation**

```json
{
  "name": "value-story",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "bin": { "vs": "./bin/vs.mjs" },
  "scripts": {
    "test": "node --test test/",
    "build:validators": "node scripts/generate-validators.mjs",
    "build:adapters": "node scripts/generate-adapters.mjs"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

```javascript
// src/drivers.mjs
export const DRIVER_GROUPS = Object.freeze({
  effectiveness: Object.freeze([
    'productivity',
    'operational-adaptability',
    'governance-oversight',
    'standardization-knowledge',
    'high-value-skills-ip',
    'differentiation',
  ]),
  efficiency: Object.freeze([
    'labor-cost-efficiency',
    'process-cost-efficiency',
    'overhead-cost-efficiency',
    'capex-reduction',
  ]),
});

export const ALL_DRIVERS = Object.freeze([
  ...DRIVER_GROUPS.effectiveness,
  ...DRIVER_GROUPS.efficiency,
]);

export const DRIVER_LABELS = Object.freeze({
  'productivity': 'Productivity',
  'operational-adaptability': 'Operational Adaptability',
  'governance-oversight': 'Governance & Oversight',
  'standardization-knowledge': 'Standardization & Knowledge',
  'high-value-skills-ip': 'High-Value Skills & IP',
  'differentiation': 'Differentiation',
  'labor-cost-efficiency': 'Labor Cost Efficiency',
  'process-cost-efficiency': 'Process Cost Efficiency',
  'overhead-cost-efficiency': 'Overhead Cost Efficiency',
  'capex-reduction': 'CapEx Reduction',
});

export function isDriver(id) {
  return typeof id === 'string' && ALL_DRIVERS.includes(id);
}

export function driverGroup(id) {
  if (DRIVER_GROUPS.effectiveness.includes(id)) return 'effectiveness';
  if (DRIVER_GROUPS.efficiency.includes(id)) return 'efficiency';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/drivers.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add package.json src/drivers.mjs test/drivers.test.mjs
git commit -m "feat: add closed value-driver enumeration"
```

---

### Task 2: Design tokens and the document shell

**Files:**
- Create: `DESIGN.md`
- Create: `src/render/tokens.mjs`
- Create: `src/render/html.mjs`
- Test: `test/html.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `TOKENS: Record<string, string>` — flat map of token name to CSS value
  - `tokensToCss(tokens = TOKENS) => string` — a `:root { ... }` block
  - `esc(value: unknown) => string` — HTML text escaping
  - `page({ title, styles, body }) => string` — complete `<!doctype html>` document

`esc` must escape `&`, `<`, `>`, `"` and `'`, in that order, and render `null`/`undefined` as the empty string.

- [ ] **Step 1: Write the failing test**

```javascript
// test/html.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, page } from '../src/render/html.mjs';
import { TOKENS, tokensToCss } from '../src/render/tokens.mjs';

test('esc neutralises markup and quotes', () => {
  assert.equal(esc('<script>"x"&\'y\'</script>'),
    '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
});

test('esc renders nullish as empty string', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

test('tokens define the dark ground and a single accent', () => {
  assert.ok(TOKENS['--vs-bg']);
  assert.ok(TOKENS['--vs-ink']);
  assert.ok(TOKENS['--vs-accent']);
});

test('tokensToCss emits a root block containing every token', () => {
  const css = tokensToCss();
  assert.ok(css.startsWith(':root{'));
  for (const name of Object.keys(TOKENS)) {
    assert.ok(css.includes(name), `missing ${name}`);
  }
});

test('page emits a self-contained document with no external references', () => {
  const html = page({ title: 'T', styles: 'body{color:red}', body: '<main>x</main>' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>T</title>'));
  assert.ok(html.includes('body{color:red}'));
  assert.ok(html.includes('<main>x</main>'));
  assert.ok(!/<script\s+src=/.test(html), 'must not load external scripts');
  assert.ok(!/<link[^>]+href=/.test(html), 'must not load external stylesheets');
  assert.ok(!/https?:\/\//.test(html), 'must contain no absolute URLs');
});

test('page escapes the title', () => {
  assert.ok(page({ title: '<x>', styles: '', body: '' }).includes('<title>&lt;x&gt;</title>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/html.test.mjs`
Expected: FAIL — `Cannot find module '../src/render/html.mjs'`

- [ ] **Step 3: Write DESIGN.md and the implementation**

```markdown
<!-- DESIGN.md -->
---
color:
  bg:            "#0A0B0D"
  surface:       "#14161A"
  surface-raised:"#1B1E24"
  ink:           "#F4F5F7"
  ink-dim:       "#8B929C"
  ink-faint:     "#5A616B"
  rule:          "#23272E"
  accent:        "#F5B942"
  accent-soft:   "rgba(245,185,66,0.14)"
  positive:      "#4ADE80"
  negative:      "#FF6B5A"
type:
  display: "-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif"
  text:    "ui-serif, 'Iowan Old Style', Palatino, Georgia, serif"
  mono:    "ui-monospace, 'SF Mono', Menlo, monospace"
  scale-hero:  "clamp(4rem, 12vw, 9rem)"
  scale-h1:    "clamp(2rem, 4vw, 3rem)"
  scale-h2:    "1.5rem"
  scale-body:  "1.0625rem"
  scale-micro: "0.75rem"
space:
  unit: "8px"
  gutter: "clamp(1.5rem, 5vw, 5rem)"
  chapter: "clamp(4rem, 10vh, 8rem)"
radius:
  card: "10px"
motion:
  duration: "820ms"
  ease: "cubic-bezier(0.16, 1, 0.3, 1)"
---

# Design

Dark, editorial, high contrast. One accent, used sparingly and only for
measured evidence. Generous negative space. Numerals are the loudest element
on the page; everything else recedes.

Explicitly not corporate-deck blue and grey.

## Rules

- The renderer never authors a hex value. It selects semantic classes whose
  colours resolve from the tokens above.
- The accent marks measured evidence only. An estimate never receives it.
- Type: display face for numerals and headlines, serif for prose. The contrast
  between the two is the editorial signal.
- Motion runs once on entry and resolves. See the motion budget in the spec.
```

```javascript
// src/render/tokens.mjs
export const TOKENS = Object.freeze({
  '--vs-bg': '#0A0B0D',
  '--vs-surface': '#14161A',
  '--vs-surface-raised': '#1B1E24',
  '--vs-ink': '#F4F5F7',
  '--vs-ink-dim': '#8B929C',
  '--vs-ink-faint': '#5A616B',
  '--vs-rule': '#23272E',
  '--vs-accent': '#F5B942',
  '--vs-accent-soft': 'rgba(245,185,66,0.14)',
  '--vs-positive': '#4ADE80',
  '--vs-negative': '#FF6B5A',
  '--vs-font-display': "-apple-system, 'SF Pro Display', Inter, system-ui, sans-serif",
  '--vs-font-text': "ui-serif, 'Iowan Old Style', Palatino, Georgia, serif",
  '--vs-font-mono': "ui-monospace, 'SF Mono', Menlo, monospace",
  '--vs-hero': 'clamp(4rem, 12vw, 9rem)',
  '--vs-h1': 'clamp(2rem, 4vw, 3rem)',
  '--vs-h2': '1.5rem',
  '--vs-body': '1.0625rem',
  '--vs-micro': '0.75rem',
  '--vs-unit': '8px',
  '--vs-gutter': 'clamp(1.5rem, 5vw, 5rem)',
  '--vs-chapter': 'clamp(4rem, 10vh, 8rem)',
  '--vs-radius': '10px',
  '--vs-duration': '820ms',
  '--vs-ease': 'cubic-bezier(0.16, 1, 0.3, 1)',
});

export function tokensToCss(tokens = TOKENS) {
  const body = Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';');
  return `:root{${body}}`;
}
```

```javascript
// src/render/html.mjs
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function page({ title, styles, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${styles}</style>
</head>
<body>
${body}
</body>
</html>
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/html.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add DESIGN.md src/render/tokens.mjs src/render/html.mjs test/html.test.mjs
git commit -m "feat: add design tokens and self-contained document shell"
```

---

### Task 3: The claim card — evidence tier as visual language

This is the credibility mechanic. A viewer must distinguish measured from estimated without reading. `claimFigures` is defined here because M1's reconciliation depends on it: it is the single authority on which numerals a claim authorises to appear on screen.

**Files:**
- Create: `src/render/claim-card.mjs`
- Test: `test/claim-card.test.mjs`

**Interfaces:**
- Consumes: `esc` from `src/render/html.mjs`
- Produces:
  - `claimCard(claim) => string` — HTML for one claim
  - `claimFigures(claim) => string[]` — every numeric literal this claim authorises, as rendered
  - `CLAIM_CARD_CSS: string`
  - `formatValue(value: number) => string` — locale-free grouping, max 2 decimals

- [ ] **Step 1: Write the failing test**

```javascript
// test/claim-card.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimCard, claimFigures, formatValue } from '../src/render/claim-card.mjs';

const measured = {
  id: 'c1', driver: 'labor-cost-efficiency', metric: 'case turnaround time',
  unit: 'hours', tier: 'measured', direction: 'decrease',
  baseline: { value: 72, asof: '2026-01', evidence_ref: 'e3' },
  current: { value: 9, asof: '2026-08', evidence_ref: 'e3' },
};

const estimated = {
  id: 'c2', driver: 'productivity', metric: 'reviewer capacity',
  unit: 'cases/week', tier: 'estimated', direction: 'increase',
  baseline: { value: 40, asof: '2026-01' },
  current: { value: 55, asof: '2026-08' },
  assumption: { statement: 'assumes steady case mix', owner: 'A. Reviewer' },
};

const qualitative = {
  id: 'c3', driver: 'governance-oversight', tier: 'qualitative',
  statement: 'every decision now carries an auditable rationale trail',
  evidence_ref: 'e5',
};

test('formatValue groups thousands and trims trailing zeros', () => {
  assert.equal(formatValue(72), '72');
  assert.equal(formatValue(1200), '1,200');
  assert.equal(formatValue(12.50), '12.5');
  assert.equal(formatValue(0.125), '0.13');
});

test('measured claims carry the measured class and cite evidence', () => {
  const html = claimCard(measured);
  assert.ok(html.includes('vs-claim--measured'));
  assert.ok(html.includes('data-evidence="e3"'));
  assert.ok(html.includes('72'));
  assert.ok(html.includes('9'));
});

test('estimated claims are marked and name the owner', () => {
  const html = claimCard(estimated);
  assert.ok(html.includes('vs-claim--estimated'));
  assert.ok(html.includes('A. Reviewer'), 'the owner must be visible');
  assert.ok(html.includes('assumes steady case mix'));
  assert.ok(!html.includes('vs-claim--measured'));
});

test('qualitative claims render no numerals at all', () => {
  const html = claimCard(qualitative);
  assert.ok(html.includes('vs-claim--qualitative'));
  assert.ok(html.includes('auditable rationale trail'));
  assert.equal(/\d/.test(html.replace(/data-[a-z]+="[^"]*"/g, '')), false,
    'qualitative cards must contain no digits in visible content');
});

test('claimFigures authorises exactly the numerals a claim renders', () => {
  assert.deepEqual(claimFigures(measured).sort(), ['72', '9'].sort());
  assert.deepEqual(claimFigures(estimated).sort(), ['40', '55'].sort());
  assert.deepEqual(claimFigures(qualitative), []);
});

test('claim content is escaped', () => {
  const html = claimCard({ ...qualitative, statement: '<img onerror=x>' });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/claim-card.test.mjs`
Expected: FAIL — `Cannot find module '../src/render/claim-card.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/render/claim-card.mjs
import { esc } from './html.mjs';

export function formatValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  const [int, frac] = String(rounded).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function claimFigures(claim) {
  if (!claim || claim.tier === 'qualitative') return [];
  const out = [];
  if (claim.baseline && claim.baseline.value !== undefined) out.push(formatValue(claim.baseline.value));
  if (claim.current && claim.current.value !== undefined) out.push(formatValue(claim.current.value));
  return out.filter(Boolean);
}

function deltaRow(claim) {
  const from = formatValue(claim.baseline?.value);
  const to = formatValue(claim.current?.value);
  const dir = claim.direction === 'decrease' ? 'down' : 'up';
  return `<p class="vs-claim__delta" data-direction="${esc(dir)}">
<span class="vs-claim__from">${esc(from)}</span>
<span class="vs-claim__arrow" aria-hidden="true">&rarr;</span>
<span class="vs-claim__to">${esc(to)}</span>
<span class="vs-claim__unit">${esc(claim.unit)}</span>
</p>`;
}

export function claimCard(claim) {
  const tier = claim?.tier === 'measured' || claim?.tier === 'estimated'
    ? claim.tier : 'qualitative';
  const evidence = claim?.baseline?.evidence_ref || claim?.evidence_ref || '';
  const attrs = [
    `class="vs-claim vs-claim--${tier}"`,
    `data-claim="${esc(claim?.id)}"`,
    evidence ? `data-evidence="${esc(evidence)}"` : '',
  ].filter(Boolean).join(' ');

  if (tier === 'qualitative') {
    return `<article ${attrs}>
<p class="vs-claim__statement">${esc(claim.statement)}</p>
<p class="vs-claim__tier">Capability</p>
</article>`;
  }

  const assumption = tier === 'estimated' && claim.assumption
    ? `<p class="vs-claim__assumption">${esc(claim.assumption.statement)}</p>
<p class="vs-claim__owner">Estimated by ${esc(claim.assumption.owner)}</p>`
    : '';

  return `<article ${attrs}>
<h3 class="vs-claim__metric">${esc(claim.metric)}</h3>
${deltaRow(claim)}
<p class="vs-claim__tier">${tier === 'measured' ? 'Measured' : 'Estimated'}</p>
${assumption}
</article>`;
}

export const CLAIM_CARD_CSS = `
.vs-claim{padding:calc(var(--vs-unit)*3);border-radius:var(--vs-radius);
  background:var(--vs-surface);border:1px solid var(--vs-rule)}
.vs-claim__metric{font-family:var(--vs-font-display);font-size:var(--vs-h2);
  font-weight:600;letter-spacing:-0.02em;margin:0 0 calc(var(--vs-unit)*2)}
.vs-claim__delta{font-family:var(--vs-font-display);font-size:var(--vs-h1);
  font-variant-numeric:tabular-nums;letter-spacing:-0.03em;margin:0;
  display:flex;align-items:baseline;gap:calc(var(--vs-unit)*1.5);flex-wrap:wrap}
.vs-claim__from{color:var(--vs-ink-faint);text-decoration:line-through;
  text-decoration-thickness:1px}
.vs-claim__arrow{color:var(--vs-ink-faint)}
.vs-claim__unit{font-family:var(--vs-font-text);font-size:var(--vs-body);
  color:var(--vs-ink-dim)}
.vs-claim__tier{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.12em;color:var(--vs-ink-dim);
  margin:calc(var(--vs-unit)*2) 0 0}
.vs-claim__assumption,.vs-claim__owner{font-family:var(--vs-font-text);
  font-size:var(--vs-micro);color:var(--vs-ink-dim);margin:calc(var(--vs-unit)) 0 0}
.vs-claim__statement{font-family:var(--vs-font-text);font-size:var(--vs-h2);
  line-height:1.4;margin:0}

/* measured: solid, accented, confident */
.vs-claim--measured{border-color:var(--vs-rule);background:var(--vs-surface-raised)}
.vs-claim--measured .vs-claim__to{color:var(--vs-accent)}
.vs-claim--measured .vs-claim__tier{color:var(--vs-accent)}

/* estimated: hairline dashed containment, never accented */
.vs-claim--estimated{border-style:dashed;border-color:var(--vs-ink-faint);
  background:transparent}
.vs-claim--estimated .vs-claim__to{color:var(--vs-ink)}

/* qualitative: a different mark entirely, no numerals */
.vs-claim--qualitative{border:none;background:transparent;
  border-left:2px solid var(--vs-ink-faint);border-radius:0;
  padding-left:calc(var(--vs-unit)*3)}
`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/claim-card.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/render/claim-card.mjs test/claim-card.test.mjs
git commit -m "feat: render evidence tier as visual language"
```

---

### Task 4: The hero delta

The frame that must land within two seconds. One large number transition, animated once on entry.

**Files:**
- Create: `src/render/delta.mjs`
- Test: `test/delta.test.mjs`

**Interfaces:**
- Consumes: `esc` from `src/render/html.mjs`; `formatValue` from `src/render/claim-card.mjs`
- Produces:
  - `heroDelta(claim, { headline }) => string`
  - `HERO_CSS: string`

- [ ] **Step 1: Write the failing test**

```javascript
// test/delta.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heroDelta, HERO_CSS } from '../src/render/delta.mjs';

const claim = {
  id: 'c1', metric: 'case turnaround time', unit: 'hours',
  tier: 'measured', direction: 'decrease',
  baseline: { value: 72, asof: '2026-01' },
  current: { value: 9, asof: '2026-08' },
};

test('hero renders baseline and current', () => {
  const html = heroDelta(claim, { headline: 'Three days became one morning' });
  assert.ok(html.includes('72'));
  assert.ok(html.includes('9'));
  assert.ok(html.includes('Three days became one morning'));
  assert.ok(html.includes('hours'));
});

test('hero marks its tier so estimates are never styled as measured', () => {
  assert.ok(heroDelta(claim, { headline: 'x' }).includes('vs-hero--measured'));
  assert.ok(heroDelta({ ...claim, tier: 'estimated' }, { headline: 'x' })
    .includes('vs-hero--estimated'));
});

test('hero returns empty string when there is no numeric claim', () => {
  assert.equal(heroDelta(null, { headline: 'x' }), '');
  assert.equal(heroDelta({ tier: 'qualitative', statement: 's' }, { headline: 'x' }), '');
});

test('motion is honoured once and respects reduced-motion', () => {
  assert.ok(HERO_CSS.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(HERO_CSS.includes('forwards'), 'entry animation must resolve and hold');
  assert.ok(!/infinite/.test(HERO_CSS), 'nothing may loop');
});

test('print path carries no animation', () => {
  assert.ok(HERO_CSS.includes('@media print'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/delta.test.mjs`
Expected: FAIL — `Cannot find module '../src/render/delta.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/render/delta.mjs
import { esc } from './html.mjs';
import { formatValue } from './claim-card.mjs';

export function heroDelta(claim, { headline } = {}) {
  if (!claim || claim.tier === 'qualitative') return '';
  if (claim.baseline?.value === undefined || claim.current?.value === undefined) return '';
  const tier = claim.tier === 'measured' ? 'measured' : 'estimated';
  return `<section class="vs-hero vs-hero--${tier}">
<p class="vs-hero__metric">${esc(claim.metric)}</p>
<p class="vs-hero__figures">
<span class="vs-hero__from">${esc(formatValue(claim.baseline.value))}</span>
<span class="vs-hero__arrow" aria-hidden="true">&rarr;</span>
<span class="vs-hero__to">${esc(formatValue(claim.current.value))}</span>
<span class="vs-hero__unit">${esc(claim.unit)}</span>
</p>
<h1 class="vs-hero__headline">${esc(headline)}</h1>
</section>`;
}

export const HERO_CSS = `
.vs-hero{padding:var(--vs-chapter) var(--vs-gutter);border-bottom:1px solid var(--vs-rule)}
.vs-hero__metric{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.16em;color:var(--vs-ink-dim);margin:0}
.vs-hero__figures{font-family:var(--vs-font-display);font-size:var(--vs-hero);
  font-weight:700;letter-spacing:-0.045em;line-height:1;font-variant-numeric:tabular-nums;
  margin:calc(var(--vs-unit)*2) 0 0;display:flex;align-items:baseline;
  gap:calc(var(--vs-unit)*2);flex-wrap:wrap}
.vs-hero__from{color:var(--vs-ink-faint)}
.vs-hero__arrow{color:var(--vs-ink-faint);font-size:0.5em}
.vs-hero__unit{font-family:var(--vs-font-text);font-size:calc(var(--vs-hero)*0.18);
  color:var(--vs-ink-dim)}
.vs-hero__headline{font-family:var(--vs-font-text);font-size:var(--vs-h1);
  font-weight:400;line-height:1.2;margin:calc(var(--vs-unit)*4) 0 0;max-width:24ch}
.vs-hero--measured .vs-hero__to{color:var(--vs-accent)}
.vs-hero--estimated .vs-hero__to{color:var(--vs-ink)}
.vs-hero--estimated .vs-hero__figures{opacity:0.92}

@keyframes vs-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.vs-hero__figures,.vs-hero__headline{animation:vs-rise var(--vs-duration) var(--vs-ease) both forwards}
.vs-hero__headline{animation-delay:140ms}

@media (prefers-reduced-motion: reduce){
  .vs-hero__figures,.vs-hero__headline{animation:none}
}
@media print{
  .vs-hero__figures,.vs-hero__headline{animation:none}
  .vs-hero{break-inside:avoid}
}
`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/delta.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/render/delta.mjs test/delta.test.mjs
git commit -m "feat: add hero delta with single-run entry motion"
```

---

### Task 5: The driver constellation

Ten drivers in two groups. Primary lit, secondaries dim, untouched drivers present but dark — the presence of unlit drivers is the point, because it shows what this initiative does *not* claim.

**Files:**
- Create: `src/render/constellation.mjs`
- Test: `test/constellation.test.mjs`

**Interfaces:**
- Consumes: `DRIVER_GROUPS`, `DRIVER_LABELS` from `src/drivers.mjs`; `esc` from `src/render/html.mjs`
- Produces:
  - `constellation({ primary, secondary }) => string` — inline SVG
  - `CONSTELLATION_CSS: string`

- [ ] **Step 1: Write the failing test**

```javascript
// test/constellation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constellation } from '../src/render/constellation.mjs';
import { ALL_DRIVERS } from '../src/drivers.mjs';

const sel = { primary: 'labor-cost-efficiency', secondary: ['productivity'] };

test('every driver appears, including unclaimed ones', () => {
  const svg = constellation(sel);
  for (const id of ALL_DRIVERS) {
    assert.ok(svg.includes(`data-driver="${id}"`), `missing ${id}`);
  }
});

test('exactly one driver is primary', () => {
  const svg = constellation(sel);
  assert.equal((svg.match(/data-state="primary"/g) || []).length, 1);
});

test('secondary and dark states are distinguished', () => {
  const svg = constellation(sel);
  assert.equal((svg.match(/data-state="secondary"/g) || []).length, 1);
  assert.equal((svg.match(/data-state="dark"/g) || []).length, 8);
});

test('renders inline svg with no external references', () => {
  const svg = constellation(sel);
  assert.ok(svg.includes('<svg'));
  assert.ok(!/https?:\/\//.test(svg));
});

test('tolerates a missing secondary list', () => {
  const svg = constellation({ primary: 'productivity' });
  assert.equal((svg.match(/data-state="dark"/g) || []).length, 9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/constellation.test.mjs`
Expected: FAIL — `Cannot find module '../src/render/constellation.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/render/constellation.mjs
import { DRIVER_GROUPS, DRIVER_LABELS } from '../drivers.mjs';
import { esc } from './html.mjs';

const COL_W = 300;
const ROW_H = 46;
const PAD = 16;

function state(id, primary, secondary) {
  if (id === primary) return 'primary';
  if (secondary.includes(id)) return 'secondary';
  return 'dark';
}

function column(ids, x, primary, secondary, heading) {
  const rows = ids.map((id, i) => {
    const y = PAD + 42 + i * ROW_H;
    return `<g data-driver="${esc(id)}" data-state="${esc(state(id, primary, secondary))}" class="vs-node">
<circle cx="${x + 7}" cy="${y - 5}" r="4"/>
<text x="${x + 24}" y="${y}">${esc(DRIVER_LABELS[id])}</text>
</g>`;
  }).join('\n');
  return `<text class="vs-node__heading" x="${x}" y="${PAD + 12}">${esc(heading)}</text>\n${rows}`;
}

export function constellation({ primary, secondary } = {}) {
  const sec = Array.isArray(secondary) ? secondary : [];
  const height = PAD * 2 + 42 + 6 * ROW_H;
  return `<figure class="vs-constellation">
<svg viewBox="0 0 ${COL_W * 2} ${height}" role="img"
     aria-label="Value drivers claimed by this initiative">
${column(DRIVER_GROUPS.effectiveness, PAD, primary, sec, 'Effectiveness')}
${column(DRIVER_GROUPS.efficiency, COL_W + PAD, primary, sec, 'Efficiency')}
</svg>
</figure>`;
}

export const CONSTELLATION_CSS = `
.vs-constellation{margin:0;padding:0 var(--vs-gutter)}
.vs-constellation svg{width:100%;height:auto;overflow:visible}
.vs-node text{font-family:var(--vs-font-display);font-size:14px;
  fill:var(--vs-ink-faint);dominant-baseline:middle}
.vs-node circle{fill:var(--vs-ink-faint)}
.vs-node__heading{font-family:var(--vs-font-display);font-size:11px;
  text-transform:uppercase;letter-spacing:0.16em;fill:var(--vs-ink-dim)}
.vs-node[data-state="primary"] text{fill:var(--vs-ink);font-weight:650}
.vs-node[data-state="primary"] circle{fill:var(--vs-accent);r:6}
.vs-node[data-state="secondary"] text{fill:var(--vs-ink-dim)}
.vs-node[data-state="secondary"] circle{fill:var(--vs-ink-dim)}
.vs-node[data-state="dark"] text{fill:var(--vs-ink-faint);opacity:0.45}
.vs-node[data-state="dark"] circle{fill:var(--vs-ink-faint);opacity:0.3}
@media print{.vs-node[data-state="dark"]{opacity:0.35}}
`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/constellation.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/render/constellation.mjs test/constellation.test.mjs
git commit -m "feat: add ten-driver constellation"
```

---

### Task 6: The four-chapter arc and top-level composition

The arc is a fixed four-slot object. `outcome` renders **only** referenced claims — it has no free-text numeric field, which is the structural reason an unsourced number cannot reach the page.

**Files:**
- Create: `src/render/chapters.mjs`
- Create: `src/render/render-case.mjs`
- Test: `test/render-case.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 2-5
- Produces:
  - `chapters(arc, claimsById) => string`
  - `CHAPTERS_CSS: string`
  - `ARC_SLOTS: readonly ['problem','capability','outcome','significance']`
  - `renderCase(doc) => string` — the complete HTML document

- [ ] **Step 1: Write the failing test**

```javascript
// test/render-case.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCase } from '../src/render/render-case.mjs';
import { ARC_SLOTS } from '../src/render/chapters.mjs';

const doc = {
  schema_version: 1,
  meta: { title: 'Intake Triage', owner: 'K. Lindqvist', period: '2026-08', motion: 'entry' },
  initiative: { id: 'int-01', name: 'Intake Triage', sponsor: 'S. Tzou', function: 'Ops', status: 'live' },
  drivers: { primary: 'labor-cost-efficiency', secondary: ['productivity'] },
  arc: {
    problem: { headline: 'Intake took three days', detail: 'Manual triage.', evidence_refs: ['e1'] },
    capability: { headline: 'Automated triage', detail: 'Classifies on arrival.', evidence_refs: ['e2'], novelty: 'first-of-kind' },
    outcome: { headline: 'Three days became one morning', claim_refs: ['c1', 'c2'] },
    significance: { headline: 'Capacity without headcount', detail: 'Scales at flat cost.' },
  },
  claims: [
    { id: 'c1', driver: 'labor-cost-efficiency', metric: 'case turnaround time', unit: 'hours',
      tier: 'measured', direction: 'decrease',
      baseline: { value: 72, asof: '2026-01', evidence_ref: 'e3' },
      current: { value: 9, asof: '2026-08', evidence_ref: 'e3' } },
    { id: 'c2', driver: 'productivity', tier: 'qualitative',
      statement: 'reviewers now see pre-sorted queues', evidence_ref: 'e4' },
  ],
  evidence: [
    { ref: 'e1', kind: 'doc', title: 'Ops review', date: '2026-01-15', locator: 'p2' },
    { ref: 'e2', kind: 'doc', title: 'Design note', date: '2026-03-02', locator: 'p1' },
    { ref: 'e3', kind: 'dataset', title: 'Triage timings', date: '2026-08-30', locator: 'triage_daily' },
    { ref: 'e4', kind: 'email', title: 'Reviewer feedback', date: '2026-08-12', locator: 'msg-88' },
  ],
};

test('all four arc slots render in order', () => {
  const html = renderCase(doc);
  const positions = ARC_SLOTS.map((s) => html.indexOf(`data-chapter="${s}"`));
  assert.ok(positions.every((p) => p >= 0), 'every slot must render');
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'slots must be in order');
});

test('outcome renders referenced claims', () => {
  const html = renderCase(doc);
  assert.ok(html.includes('data-claim="c1"'));
  assert.ok(html.includes('data-claim="c2"'));
});

test('hero uses the first measured claim referenced by outcome', () => {
  const html = renderCase(doc);
  const hero = html.slice(html.indexOf('vs-hero'), html.indexOf('</section>'));
  assert.ok(hero.includes('72'));
  assert.ok(hero.includes('Three days became one morning'));
});

test('document is self-contained', () => {
  const html = renderCase(doc);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!/https?:\/\//.test(html));
  assert.ok(!/<script/.test(html), 'no javascript is needed');
});

test('evidence registry renders with every source', () => {
  const html = renderCase(doc);
  for (const e of doc.evidence) assert.ok(html.includes(e.title), `missing ${e.title}`);
});

test('a missing arc slot does not throw', () => {
  const partial = { ...doc, arc: { ...doc.arc, significance: undefined } };
  assert.doesNotThrow(() => renderCase(partial));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render-case.test.mjs`
Expected: FAIL — `Cannot find module '../src/render/render-case.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/render/chapters.mjs
import { esc } from './html.mjs';
import { claimCard } from './claim-card.mjs';

export const ARC_SLOTS = Object.freeze(['problem', 'capability', 'outcome', 'significance']);

const SLOT_EYEBROW = Object.freeze({
  problem: 'What problem existed',
  capability: 'What capability AI unlocked',
  outcome: 'What outcome changed',
  significance: 'Why it matters to the firm',
});

function chapter(slot, node, claimsById) {
  if (!node) return '';
  const claims = slot === 'outcome'
    ? (node.claim_refs || []).map((r) => claimsById.get(r)).filter(Boolean).map(claimCard).join('\n')
    : '';
  const detail = slot === 'outcome' || !node.detail
    ? ''
    : `<p class="vs-chapter__detail">${esc(node.detail)}</p>`;
  return `<section class="vs-chapter" data-chapter="${esc(slot)}">
<p class="vs-chapter__eyebrow">${esc(SLOT_EYEBROW[slot])}</p>
<h2 class="vs-chapter__headline">${esc(node.headline)}</h2>
${detail}
${claims ? `<div class="vs-chapter__claims">${claims}</div>` : ''}
</section>`;
}

export function chapters(arc = {}, claimsById = new Map()) {
  return ARC_SLOTS.map((slot) => chapter(slot, arc[slot], claimsById)).join('\n');
}

export const CHAPTERS_CSS = `
.vs-chapter{padding:var(--vs-chapter) var(--vs-gutter);
  border-bottom:1px solid var(--vs-rule)}
.vs-chapter__eyebrow{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.16em;color:var(--vs-ink-dim);margin:0}
.vs-chapter__headline{font-family:var(--vs-font-text);font-size:var(--vs-h1);
  font-weight:400;line-height:1.2;margin:calc(var(--vs-unit)*2) 0 0;max-width:22ch}
.vs-chapter__detail{font-family:var(--vs-font-text);font-size:var(--vs-body);
  line-height:1.65;color:var(--vs-ink-dim);margin:calc(var(--vs-unit)*3) 0 0;max-width:62ch}
.vs-chapter__claims{display:grid;gap:calc(var(--vs-unit)*2);
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  margin-top:calc(var(--vs-unit)*5)}
@media print{.vs-chapter{break-inside:avoid;border-bottom:1px solid #ccc}}
`;
```

```javascript
// src/render/render-case.mjs
import { page, esc } from './html.mjs';
import { tokensToCss } from './tokens.mjs';
import { CLAIM_CARD_CSS } from './claim-card.mjs';
import { heroDelta, HERO_CSS } from './delta.mjs';
import { constellation, CONSTELLATION_CSS } from './constellation.mjs';
import { chapters, CHAPTERS_CSS } from './chapters.mjs';

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--vs-bg);color:var(--vs-ink);
  font-family:var(--vs-font-text);font-size:var(--vs-body);
  -webkit-font-smoothing:antialiased}
.vs-meta{padding:calc(var(--vs-unit)*4) var(--vs-gutter) 0;
  font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.16em;color:var(--vs-ink-dim)}
.vs-evidence{padding:var(--vs-chapter) var(--vs-gutter)}
.vs-evidence h2{font-family:var(--vs-font-display);font-size:var(--vs-micro);
  text-transform:uppercase;letter-spacing:0.16em;color:var(--vs-ink-dim);
  margin:0 0 calc(var(--vs-unit)*3)}
.vs-evidence ol{margin:0;padding-left:1.2em;color:var(--vs-ink-dim);
  font-size:var(--vs-micro);line-height:1.9}
@media print{body{background:#fff;color:#111}}
`;

function evidenceList(evidence = []) {
  if (!evidence.length) return '';
  const items = evidence.map((e) => `<li id="ev-${esc(e.ref)}">
<strong>${esc(e.title)}</strong> &mdash; ${esc(e.kind)}, ${esc(e.date)}${e.locator ? `, ${esc(e.locator)}` : ''}
</li>`).join('\n');
  return `<section class="vs-evidence"><h2>Evidence</h2><ol>${items}</ol></section>`;
}

function pickHeroClaim(doc, claimsById) {
  const refs = doc?.arc?.outcome?.claim_refs || [];
  const referenced = refs.map((r) => claimsById.get(r)).filter(Boolean);
  return referenced.find((c) => c.tier === 'measured')
    || referenced.find((c) => c.tier === 'estimated')
    || null;
}

export function renderCase(doc) {
  const claimsById = new Map((doc.claims || []).map((c) => [c.id, c]));
  const hero = pickHeroClaim(doc, claimsById);
  const styles = [
    tokensToCss(), BASE_CSS, HERO_CSS, CHAPTERS_CSS, CLAIM_CARD_CSS, CONSTELLATION_CSS,
  ].join('\n');

  const body = `<main>
<p class="vs-meta">${esc(doc.initiative?.name)} &middot; ${esc(doc.meta?.period)}</p>
${heroDelta(hero, { headline: doc.arc?.outcome?.headline })}
${chapters(doc.arc, claimsById)}
${constellation(doc.drivers)}
${evidenceList(doc.evidence)}
</main>`;

  return page({ title: doc.meta?.title || doc.initiative?.name || 'Value Story', styles, body });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/render-case.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/render/chapters.mjs src/render/render-case.mjs test/render-case.test.mjs
git commit -m "feat: compose the four-chapter value narrative"
```

---

### Task 7: CLI, fixture, and the visual iteration loop

M0's exit condition. After this task the artifact is openable, and the remaining work is design iteration against a real initiative.

**Files:**
- Create: `bin/vs.mjs`
- Create: `fixtures/example.value-case.json`
- Create: `FINGERPRINTS.md`
- Test: `test/cli.test.mjs`

**Interfaces:**
- Consumes: `renderCase` from `src/render/render-case.mjs`
- Produces: `vs render <input.json> <output.html>` — exit 0 on success, exit 1 with a message on stderr otherwise

- [ ] **Step 1: Write the failing test**

```javascript
// test/cli.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));

test('render writes a self-contained artifact and exits zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const out = join(dir, 'a.html');
  execFileSync('node', [CLI, 'render', FIXTURE, out]);
  const html = readFileSync(out, 'utf8');
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(!/https?:\/\//.test(html));
});

test('render exits non-zero on unreadable input', () => {
  assert.throws(() => execFileSync('node', [CLI, 'render', '/nope.json', '/tmp/x.html'],
    { stdio: 'pipe' }));
});

test('render exits non-zero on malformed json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  assert.throws(() => execFileSync('node', [CLI, 'render', bad, join(dir, 'o.html')],
    { stdio: 'pipe' }));
});

test('the fixture exercises all three claim tiers', () => {
  const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const tiers = new Set(doc.claims.map((c) => c.tier));
  assert.ok(tiers.has('measured'));
  assert.ok(tiers.has('estimated'));
  assert.ok(tiers.has('qualitative'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli.test.mjs`
Expected: FAIL — `Cannot find module '.../bin/vs.mjs'`

- [ ] **Step 3: Write the CLI, the fixture, and FINGERPRINTS.md**

```javascript
// bin/vs.mjs
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { renderCase } from '../src/render/render-case.mjs';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [command, input, output] = process.argv.slice(2);

if (command !== 'render' || !input || !output) {
  fail('usage: vs render <input.json> <output.html>');
}

let doc;
try {
  doc = JSON.parse(readFileSync(input, 'utf8'));
} catch (error) {
  fail(`could not read ${input}: ${error.message}`);
}

try {
  writeFileSync(output, renderCase(doc), 'utf8');
} catch (error) {
  fail(`could not write ${output}: ${error.message}`);
}

process.stdout.write(`${output}\n`);
```

The fixture is **synthetic**. Replace its content with a real initiative during visual iteration, but keep a synthetic copy committed as the test corpus.

```json
{
  "schema_version": 1,
  "meta": { "title": "Intake Triage", "owner": "K. Lindqvist", "period": "2026-08",
            "quality_profile": "showcase", "motion": "entry" },
  "initiative": { "id": "int-01", "name": "Intake Triage", "sponsor": "S. Tzou",
                  "function": "Operations", "status": "live" },
  "drivers": { "primary": "labor-cost-efficiency",
               "secondary": ["productivity", "governance-oversight"] },
  "arc": {
    "problem": {
      "headline": "Intake took three days before anyone looked at it",
      "detail": "Every case was triaged by hand against a rota that could not flex with volume.",
      "evidence_refs": ["e1"]
    },
    "capability": {
      "headline": "Cases classify themselves on arrival",
      "detail": "Routing and priority are assigned at ingestion, with the rationale recorded.",
      "evidence_refs": ["e2"],
      "novelty": "first-of-kind"
    },
    "outcome": {
      "headline": "Three days became one morning",
      "claim_refs": ["c1", "c2", "c3"]
    },
    "significance": {
      "headline": "Capacity that grows without headcount",
      "detail": "Volume can double without a proportional increase in reviewer cost."
    }
  },
  "claims": [
    { "id": "c1", "driver": "labor-cost-efficiency", "metric": "case turnaround time",
      "unit": "hours", "tier": "measured", "direction": "decrease",
      "baseline": { "value": 72, "asof": "2026-01", "evidence_ref": "e3" },
      "current":  { "value": 9,  "asof": "2026-08", "evidence_ref": "e3" } },
    { "id": "c2", "driver": "productivity", "metric": "reviewer capacity",
      "unit": "cases/week", "tier": "estimated", "direction": "increase",
      "baseline": { "value": 40, "asof": "2026-01" },
      "current":  { "value": 55, "asof": "2026-08" },
      "assumption": { "statement": "assumes steady case mix across both periods",
                      "owner": "M. Behbahani" } },
    { "id": "c3", "driver": "governance-oversight", "tier": "qualitative",
      "statement": "every routing decision now carries an auditable rationale trail",
      "evidence_ref": "e4" }
  ],
  "evidence": [
    { "ref": "e1", "kind": "doc", "title": "Operations review", "author": "Ops",
      "date": "2026-01-15", "locator": "page 2" },
    { "ref": "e2", "kind": "doc", "title": "Triage design note", "author": "Eng",
      "date": "2026-03-02", "locator": "page 1" },
    { "ref": "e3", "kind": "dataset", "title": "Triage timings", "author": "Ops",
      "date": "2026-08-30", "locator": "triage_daily" },
    { "ref": "e4", "kind": "email", "title": "Reviewer feedback", "author": "Review team",
      "date": "2026-08-12", "locator": "message 88" }
  ]
}
```

```markdown
<!-- FINGERPRINTS.md -->
# Fingerprints

Patterns that make output read as machine-generated. Avoid each by name.

- Gradient on every surface. One flat ground, one accent.
- Emoji used as iconography.
- Three-column feature grids of equal-weight cards.
- Generic stock iconography.
- Centred everything. Set text left; let the page have an axis.
- Purple-to-blue gradients.
- Rounded pills on every control.
- Drop shadows standing in for hierarchy. Use space and contrast instead.
- Decorative filler copy added to balance a layout. Redistribute space instead.
- Every section the same height and rhythm.
```

- [ ] **Step 4: Run tests and open the artifact**

```bash
node --test test/
node bin/vs.mjs render fixtures/example.value-case.json /tmp/value-story-preview.html
open /tmp/value-story-preview.html
```

Expected: all tests PASS; the artifact opens with the hero delta above the fold.

Now iterate on the visuals. Change only `DESIGN.md` tokens and the `*_CSS` exports; re-run the two commands above after each change. **Do not add JavaScript, webfonts, or a second theme.** Check against `FINGERPRINTS.md` before declaring the pass finished.

- [ ] **Step 5: Commit**

```bash
git add bin/vs.mjs fixtures/example.value-case.json FINGERPRINTS.md test/cli.test.mjs
git commit -m "feat: add render CLI, synthetic fixture, and fingerprint catalogue"
```

---

**M0 exit gate.** Render a real initiative, look at it, and show it to the narrative owner. Do not begin M1 until the visual is one you would put in front of the executive sponsor. If it is not, keep iterating in Task 7 — schema rigor cannot rescue a weak artifact.

---

# MILESTONE 1 — Freeze the contract

---

### Task 8: The diagnostics module

**Files:**
- Create: `src/diagnostics.mjs`
- Test: `test/diagnostics.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `normalizedDiagnostic(d) => Diagnostic` — `{code, severity, message, subject, evidence, supportedFixes, suppresses?}`
  - `recordDiagnostic(d) => void`
  - `collected() => Diagnostic[]`
  - `resetDiagnostics() => void`
  - `withRecordingSuppressed(fn) => any`
  - `applySuppression(diagnostics) => Diagnostic[]`
  - `throwDiagnosticError(message, diagnostics) => never`
  - `fallbackDiagnostic(error, input) => Diagnostic`
  - `installDiagnosticBoundary() => void`

Unknown severity coerces to `'error'`; missing code to `'internal/unclassified'`; `supportedFixes` is deduped and empty-filtered. Recording dedupes by message.

- [ ] **Step 1: Write the failing test**

```javascript
// test/diagnostics.test.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizedDiagnostic, recordDiagnostic, collected, resetDiagnostics,
  withRecordingSuppressed, applySuppression,
} from '../src/diagnostics.mjs';

beforeEach(() => resetDiagnostics());

test('normalizes an incomplete diagnostic into the full envelope', () => {
  const d = normalizedDiagnostic({ message: 'x' });
  assert.equal(d.code, 'internal/unclassified');
  assert.equal(d.severity, 'error');
  assert.deepEqual(d.subject, {});
  assert.deepEqual(d.evidence, {});
  assert.deepEqual(d.supportedFixes, []);
});

test('coerces unknown severity to error and keeps warning', () => {
  assert.equal(normalizedDiagnostic({ severity: 'nonsense' }).severity, 'error');
  assert.equal(normalizedDiagnostic({ severity: 'warning' }).severity, 'warning');
});

test('dedupes and trims supportedFixes', () => {
  const d = normalizedDiagnostic({ supportedFixes: [' a ', 'a', '', 'b'] });
  assert.deepEqual(d.supportedFixes, ['a', 'b']);
});

test('strips undefined values from subject', () => {
  assert.deepEqual(normalizedDiagnostic({ subject: { a: 1, b: undefined } }).subject, { a: 1 });
});

test('recording dedupes by message', () => {
  recordDiagnostic({ code: 'a/b', message: 'same' });
  recordDiagnostic({ code: 'c/d', message: 'same' });
  assert.equal(collected().length, 1);
});

test('suppressed recording discards diagnostics from speculative work', () => {
  withRecordingSuppressed(() => recordDiagnostic({ code: 'a/b', message: 'speculative' }));
  assert.equal(collected().length, 0);
  recordDiagnostic({ code: 'a/b', message: 'real' });
  assert.equal(collected().length, 1);
});

test('applySuppression removes codes named by a present root cause', () => {
  const out = applySuppression([
    normalizedDiagnostic({ code: 'driver/unknown', message: 'r',
      suppresses: ['claim/driver-undeclared'] }),
    normalizedDiagnostic({ code: 'claim/driver-undeclared', message: 'c' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'driver/unknown');
});

test('a suppressing diagnostic never suppresses itself', () => {
  const out = applySuppression([
    normalizedDiagnostic({ code: 'a/b', message: 'm', suppresses: ['a/b'] }),
  ]);
  assert.equal(out.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/diagnostics.test.mjs`
Expected: FAIL — `Cannot find module '../src/diagnostics.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/diagnostics.mjs
import fs from 'node:fs';

const recorded = [];
const recordedMessages = new Set();
let suppressionDepth = 0;
let boundaryInstalled = false;

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

function stringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((v) => String(v).trim()).filter(Boolean))]
    : [];
}

export function normalizedDiagnostic(diagnostic) {
  return {
    code: String(diagnostic?.code || 'internal/unclassified'),
    severity: diagnostic?.severity === 'warning' ? 'warning' : 'error',
    message: String(diagnostic?.message || 'Unclassified failure.').trim(),
    subject: plainObject(diagnostic?.subject),
    evidence: plainObject(diagnostic?.evidence),
    supportedFixes: stringList(diagnostic?.supportedFixes),
    ...(Array.isArray(diagnostic?.suppresses)
      ? { suppresses: stringList(diagnostic.suppresses) } : {}),
  };
}

export function recordDiagnostic(diagnostic) {
  if (suppressionDepth > 0) return;
  const normalized = normalizedDiagnostic(diagnostic);
  if (recordedMessages.has(normalized.message)) return;
  recordedMessages.add(normalized.message);
  recorded.push(normalized);
}

export function collected() {
  return [...recorded];
}

export function resetDiagnostics() {
  recorded.length = 0;
  recordedMessages.clear();
  suppressionDepth = 0;
}

export function withRecordingSuppressed(callback) {
  suppressionDepth += 1;
  try {
    return callback();
  } finally {
    suppressionDepth -= 1;
  }
}

export function applySuppression(diagnostics) {
  const suppressed = new Set();
  for (const d of diagnostics) {
    for (const code of d.suppresses || []) {
      if (code !== d.code) suppressed.add(code);
    }
  }
  return diagnostics.filter((d) => !suppressed.has(d.code));
}

export function throwDiagnosticError(message, diagnostics) {
  for (const d of diagnostics || []) recordDiagnostic(d);
  const error = new Error(message);
  error.vsDiagnostics = (diagnostics || []).map(normalizedDiagnostic);
  throw error;
}

export function fallbackDiagnostic(error, input) {
  if (error instanceof SyntaxError) {
    return normalizedDiagnostic({
      code: 'input/json-parse',
      message: `Input JSON could not be parsed: ${error.message}`,
      subject: { input },
      evidence: { reason: error.message },
      supportedFixes: ['repair the JSON syntax and run validation again'],
    });
  }
  if (['ENOENT', 'EACCES', 'EISDIR'].includes(error?.code)) {
    return normalizedDiagnostic({
      code: 'input/read',
      message: `Input could not be read: ${error.message}`,
      subject: { input },
      evidence: { systemCode: error.code },
      supportedFixes: ['provide one readable JSON input file'],
    });
  }
  return normalizedDiagnostic({
    code: 'internal/unclassified',
    message: error?.message || 'Renderer failed without a diagnostic.',
    subject: { input },
    evidence: { errorName: error?.name || 'Error' },
  });
}

export function installDiagnosticBoundary() {
  if (boundaryInstalled) return;
  boundaryInstalled = true;
  process.on('uncaughtException', (error) => {
    const payload = JSON.stringify({
      schemaVersion: 1, ok: false, source: 'renderer',
      error: error?.message || 'Renderer failed without a diagnostic.',
      diagnostics: collected().length ? collected() : [fallbackDiagnostic(error)],
    });
    try {
      fs.writeSync(process.stderr.fd, `${payload}\n`);
    } catch {
      // Already failing; do not mask the real error with a stream failure.
    }
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/diagnostics.test.mjs`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/diagnostics.mjs test/diagnostics.test.mjs
git commit -m "feat: add machine-readable diagnostic envelope"
```

---

### Task 9: Schemas and standalone validator generation

Ajv is a build-time tool only. `scripts/generate-validators.mjs` emits a dependency-free ESM module into `generated/`, which is **committed**, so the runtime has no `node_modules`.

**Files:**
- Create: `schemas/common.schema.json`
- Create: `schemas/value-case.schema.json`
- Create: `scripts/generate-validators.mjs`
- Modify: `package.json` — add `devDependencies`
- Test: `test/schema.test.mjs`

**Interfaces:**
- Produces: `generated/validate-value-case.mjs` with a default export `validate(data) => boolean`, carrying `validate.errors: AjvError[]`

- [ ] **Step 1: Write the failing test**

```javascript
// test/schema.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import validate from '../generated/validate-value-case.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('the fixture validates', () => {
  assert.equal(validate(good()), true, JSON.stringify(validate.errors, null, 2));
});

test('rejects a driver outside the closed enumeration', () => {
  const doc = good();
  doc.drivers.primary = 'cost-savings';
  assert.equal(validate(doc), false);
});

test('rejects a missing arc slot', () => {
  const doc = good();
  delete doc.arc.significance;
  assert.equal(validate(doc), false);
});

test('rejects a free-text field on the outcome chapter', () => {
  const doc = good();
  doc.arc.outcome.detail = 'we cut 40 hours';
  assert.equal(validate(doc), false, 'outcome must not accept free text');
});

test('rejects a measured claim without a baseline', () => {
  const doc = good();
  delete doc.claims[0].baseline;
  assert.equal(validate(doc), false);
});

test('rejects an estimated claim without an assumption owner', () => {
  const doc = good();
  delete doc.claims[1].assumption.owner;
  assert.equal(validate(doc), false);
});

test('rejects numeric fields on a qualitative claim', () => {
  const doc = good();
  doc.claims[2].baseline = { value: 1, asof: '2026-01' };
  assert.equal(validate(doc), false);
});

test('rejects a malformed date', () => {
  const doc = good();
  doc.claims[0].baseline.asof = 'Jan 2026';
  assert.equal(validate(doc), false);
});
```

- [ ] **Step 2: Install Ajv, run test to verify it fails**

```bash
npm install --save-dev ajv@8.20.0
node --test test/schema.test.mjs
```

Expected: FAIL — `Cannot find module '../generated/validate-value-case.mjs'`

- [ ] **Step 3: Write the schemas and the generator**

```json
{
  "$id": "https://value-story.local/common.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "driver": {
      "type": "string",
      "enum": ["productivity", "operational-adaptability", "governance-oversight",
               "standardization-knowledge", "high-value-skills-ip", "differentiation",
               "labor-cost-efficiency", "process-cost-efficiency",
               "overhead-cost-efficiency", "capex-reduction"]
    },
    "period": { "type": "string", "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])$" },
    "date":   { "type": "string", "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$" },
    "ref":    { "type": "string", "minLength": 1 },
    "point": {
      "type": "object",
      "properties": {
        "value": { "type": "number" },
        "asof": { "$ref": "#/$defs/period" },
        "evidence_ref": { "$ref": "#/$defs/ref" }
      },
      "required": ["value", "asof"],
      "additionalProperties": false
    },
    "prose_chapter": {
      "type": "object",
      "properties": {
        "headline": { "type": "string", "minLength": 1 },
        "detail": { "type": "string", "minLength": 1 },
        "evidence_refs": { "type": "array", "items": { "$ref": "#/$defs/ref" } },
        "novelty": { "type": "string", "enum": ["first-of-kind", "incremental", "reusable"] }
      },
      "required": ["headline"],
      "additionalProperties": false
    }
  }
}
```

```json
{
  "$id": "https://value-story.local/value-case.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["schema_version", "meta", "initiative", "drivers", "arc", "claims", "evidence"],
  "additionalProperties": false,
  "properties": {
    "schema_version": { "const": 1 },
    "meta": {
      "type": "object",
      "required": ["title", "period"],
      "additionalProperties": false,
      "properties": {
        "title": { "type": "string", "minLength": 1 },
        "owner": { "type": "string" },
        "period": { "$ref": "common.schema.json#/$defs/period" },
        "quality_profile": { "type": "string", "enum": ["draft", "showcase"] },
        "motion": { "type": "string", "enum": ["static", "entry"] }
      }
    },
    "initiative": {
      "type": "object",
      "required": ["id", "name"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "name": { "type": "string", "minLength": 1 },
        "sponsor": { "type": "string" },
        "function": { "type": "string" },
        "status": { "type": "string", "enum": ["poc", "pilot", "live", "retired"] }
      }
    },
    "drivers": {
      "type": "object",
      "required": ["primary"],
      "additionalProperties": false,
      "properties": {
        "primary": { "$ref": "common.schema.json#/$defs/driver" },
        "secondary": {
          "type": "array",
          "items": { "$ref": "common.schema.json#/$defs/driver" },
          "uniqueItems": true
        }
      }
    },
    "arc": {
      "type": "object",
      "required": ["problem", "capability", "outcome", "significance"],
      "additionalProperties": false,
      "properties": {
        "problem": { "$ref": "common.schema.json#/$defs/prose_chapter" },
        "capability": { "$ref": "common.schema.json#/$defs/prose_chapter" },
        "significance": { "$ref": "common.schema.json#/$defs/prose_chapter" },
        "outcome": {
          "type": "object",
          "required": ["headline", "claim_refs"],
          "additionalProperties": false,
          "properties": {
            "headline": { "type": "string", "minLength": 1 },
            "claim_refs": {
              "type": "array",
              "minItems": 1,
              "items": { "$ref": "common.schema.json#/$defs/ref" }
            }
          }
        }
      }
    },
    "claims": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "driver", "tier"],
        "additionalProperties": false,
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "driver": { "$ref": "common.schema.json#/$defs/driver" },
          "tier": { "type": "string", "enum": ["measured", "estimated", "qualitative"] },
          "metric": { "type": "string", "minLength": 1 },
          "unit": { "type": "string", "minLength": 1 },
          "direction": { "type": "string", "enum": ["increase", "decrease"] },
          "baseline": { "$ref": "common.schema.json#/$defs/point" },
          "current": { "$ref": "common.schema.json#/$defs/point" },
          "statement": { "type": "string", "minLength": 1 },
          "evidence_ref": { "$ref": "common.schema.json#/$defs/ref" },
          "assumption": {
            "type": "object",
            "required": ["statement", "owner"],
            "additionalProperties": false,
            "properties": {
              "statement": { "type": "string", "minLength": 1 },
              "owner": { "type": "string", "minLength": 1 }
            }
          }
        },
        "allOf": [
          {
            "if": { "properties": { "tier": { "const": "measured" } }, "required": ["tier"] },
            "then": { "required": ["metric", "unit", "direction", "baseline", "current"] }
          },
          {
            "if": { "properties": { "tier": { "const": "estimated" } }, "required": ["tier"] },
            "then": { "required": ["metric", "unit", "direction", "baseline", "current", "assumption"] }
          },
          {
            "if": { "properties": { "tier": { "const": "qualitative" } }, "required": ["tier"] },
            "then": {
              "required": ["statement"],
              "not": { "anyOf": [
                { "required": ["baseline"] }, { "required": ["current"] },
                { "required": ["unit"] }, { "required": ["direction"] }
              ] }
            }
          }
        ]
      }
    },
    "evidence": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["ref", "kind", "title", "date"],
        "additionalProperties": false,
        "properties": {
          "ref": { "$ref": "common.schema.json#/$defs/ref" },
          "kind": { "type": "string", "enum": ["doc", "email", "dataset", "interview"] },
          "title": { "type": "string", "minLength": 1 },
          "author": { "type": "string" },
          "date": { "$ref": "common.schema.json#/$defs/date" },
          "locator": { "type": "string" },
          "quote": { "type": "string" }
        }
      }
    }
  }
}
```

```javascript
// scripts/generate-validators.mjs
import Ajv from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => JSON.parse(readFileSync(join(root, 'schemas', name), 'utf8'));

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  code: { source: true, esm: true },
  schemas: [read('common.schema.json')],
});

const validate = ajv.compile(read('value-case.schema.json'));
mkdirSync(join(root, 'generated'), { recursive: true });
writeFileSync(join(root, 'generated', 'validate-value-case.mjs'), standaloneCode(ajv, validate));
process.stdout.write('generated/validate-value-case.mjs\n');
```

- [ ] **Step 4: Generate and run the test**

```bash
node scripts/generate-validators.mjs
node --test test/schema.test.mjs
```

Expected: PASS — 8 tests. If the fixture fails, fix the **fixture**, not the schema — the schema is the contract.

- [ ] **Step 5: Commit**

```bash
git add schemas/ scripts/generate-validators.mjs generated/ package.json package-lock.json test/schema.test.mjs
git commit -m "feat: add value-case schema with standalone validator generation"
```

---

### Task 10: Semantic invariants

The five invariants from spec §4.6. Schema validation cannot express them because they are cross-references.

**Files:**
- Create: `src/semantic.mjs`
- Test: `test/semantic.test.mjs`

**Interfaces:**
- Consumes: `isDriver` from `src/drivers.mjs`; `normalizedDiagnostic` from `src/diagnostics.mjs`
- Produces: `semanticDiagnostics(doc) => Diagnostic[]`

- [ ] **Step 1: Write the failing test**

```javascript
// test/semantic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { semanticDiagnostics } from '../src/semantic.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const codes = (doc) => semanticDiagnostics(doc).map((d) => d.code);

test('the fixture is semantically clean', () => {
  assert.deepEqual(semanticDiagnostics(good()), []);
});

test('flags a claim on an undeclared driver', () => {
  const doc = good();
  doc.claims[0].driver = 'differentiation';
  assert.ok(codes(doc).includes('claim/driver-undeclared'));
});

test('flags a primary driver with no claim', () => {
  const doc = good();
  doc.claims = doc.claims.filter((c) => c.driver !== doc.drivers.primary);
  assert.ok(codes(doc).includes('driver/primary-no-claim'));
});

test('flags a secondary driver duplicating the primary', () => {
  const doc = good();
  doc.drivers.secondary = [doc.drivers.primary];
  assert.ok(codes(doc).includes('driver/secondary-shadows-primary'));
});

test('flags an unresolved evidence reference', () => {
  const doc = good();
  doc.claims[0].baseline.evidence_ref = 'e999';
  assert.ok(codes(doc).includes('evidence/ref-unresolved'));
});

test('flags an unresolved claim reference from the outcome chapter', () => {
  const doc = good();
  doc.arc.outcome.claim_refs.push('c999');
  assert.ok(codes(doc).includes('evidence/ref-unresolved'));
});

test('supportedFixes are JSON Pointers into the offending location', () => {
  const doc = good();
  doc.claims[0].driver = 'differentiation';
  const d = semanticDiagnostics(doc).find((x) => x.code === 'claim/driver-undeclared');
  assert.match(d.supportedFixes[0], /\/claims\/0\//);
  assert.equal(d.subject.index, 0);
});

test('an unknown driver suppresses the undeclared-driver cascade', () => {
  const doc = good();
  doc.drivers.primary = 'not-a-driver';
  const d = semanticDiagnostics(doc).find((x) => x.code === 'driver/unknown');
  assert.ok(d.suppresses.includes('claim/driver-undeclared'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/semantic.test.mjs`
Expected: FAIL — `Cannot find module '../src/semantic.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/semantic.mjs
import { isDriver } from './drivers.mjs';
import { normalizedDiagnostic } from './diagnostics.mjs';

export function semanticDiagnostics(doc) {
  const out = [];
  const push = (d) => out.push(normalizedDiagnostic(d));

  const primary = doc?.drivers?.primary;
  const secondary = Array.isArray(doc?.drivers?.secondary) ? doc.drivers.secondary : [];
  const declared = new Set([primary, ...secondary].filter(Boolean));

  if (primary && !isDriver(primary)) {
    push({
      code: 'driver/unknown',
      message: `Primary driver ${JSON.stringify(primary)} is not one of the ten value drivers.`,
      subject: { pointer: '/drivers/primary', value: primary },
      evidence: { closedEnumeration: true },
      supportedFixes: ['set /drivers/primary to one of the ten driver ids'],
      suppresses: ['claim/driver-undeclared', 'driver/primary-no-claim'],
    });
  }

  secondary.forEach((id, i) => {
    if (id === primary) {
      push({
        code: 'driver/secondary-shadows-primary',
        message: `Secondary driver ${JSON.stringify(id)} repeats the primary driver.`,
        subject: { pointer: `/drivers/secondary/${i}`, value: id },
        evidence: { primary },
        supportedFixes: [`remove /drivers/secondary/${i}`],
      });
    }
  });

  const claims = Array.isArray(doc?.claims) ? doc.claims : [];
  claims.forEach((claim, i) => {
    if (claim?.driver && !declared.has(claim.driver)) {
      push({
        code: 'claim/driver-undeclared',
        message: `Claim ${JSON.stringify(claim.id)} names driver ${JSON.stringify(claim.driver)}, which the initiative does not declare.`,
        subject: { collection: 'claims', index: i, id: claim.id, driver: claim.driver },
        evidence: { declared: [...declared] },
        supportedFixes: [
          `set /claims/${i}/driver to a declared driver`,
          `add ${JSON.stringify(claim.driver)} to /drivers/secondary`,
        ],
      });
    }
  });

  if (primary && isDriver(primary) && !claims.some((c) => c?.driver === primary)) {
    push({
      code: 'driver/primary-no-claim',
      message: `Primary driver ${JSON.stringify(primary)} has no claim behind it.`,
      subject: { pointer: '/drivers/primary', value: primary },
      evidence: { claimCount: claims.length },
      supportedFixes: [`add a claim to /claims whose driver is ${JSON.stringify(primary)}`],
    });
  }

  const evidenceRefs = new Set((doc?.evidence || []).map((e) => e?.ref).filter(Boolean));
  const claimIds = new Set(claims.map((c) => c?.id).filter(Boolean));

  const checkEvidence = (ref, pointer) => {
    if (ref && !evidenceRefs.has(ref)) {
      push({
        code: 'evidence/ref-unresolved',
        message: `Reference ${JSON.stringify(ref)} at ${pointer} does not resolve to an evidence entry.`,
        subject: { pointer, ref },
        evidence: { knownRefs: [...evidenceRefs] },
        supportedFixes: [`set ${pointer} to a ref present in /evidence`],
        suppresses: ['claim/measured-no-baseline'],
      });
    }
  };

  claims.forEach((claim, i) => {
    checkEvidence(claim?.baseline?.evidence_ref, `/claims/${i}/baseline/evidence_ref`);
    checkEvidence(claim?.current?.evidence_ref, `/claims/${i}/current/evidence_ref`);
    checkEvidence(claim?.evidence_ref, `/claims/${i}/evidence_ref`);
  });

  for (const slot of ['problem', 'capability', 'significance']) {
    (doc?.arc?.[slot]?.evidence_refs || []).forEach((ref, i) => {
      checkEvidence(ref, `/arc/${slot}/evidence_refs/${i}`);
    });
  }

  (doc?.arc?.outcome?.claim_refs || []).forEach((ref, i) => {
    if (!claimIds.has(ref)) {
      push({
        code: 'evidence/ref-unresolved',
        message: `Outcome references claim ${JSON.stringify(ref)}, which does not exist.`,
        subject: { pointer: `/arc/outcome/claim_refs/${i}`, ref },
        evidence: { knownClaims: [...claimIds] },
        supportedFixes: [`set /arc/outcome/claim_refs/${i} to an id present in /claims`],
      });
    }
  });

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/semantic.test.mjs`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/semantic.mjs test/semantic.test.mjs
git commit -m "feat: enforce cross-reference invariants"
```

---

### Task 11: Figure reconciliation

Spec §4.6 invariant 5. Every numeral on screen must trace to a claim. This is the hallucination guard, and it is the only check that catches an invented figure.

**Files:**
- Create: `src/reconcile.mjs`
- Test: `test/reconcile.test.mjs`

**Interfaces:**
- Consumes: `claimFigures` from `src/render/claim-card.mjs`; `normalizedDiagnostic` from `src/diagnostics.mjs`
- Produces:
  - `visibleFigures(html) => string[]` — numerals in rendered text, attributes excluded
  - `reconcileDiagnostics(doc, html) => Diagnostic[]`

Only figures inside claim and hero elements are reconciled; dates, the evidence list and `data-*` attributes are outside those regions and are therefore not checked.

- [ ] **Step 1: Write the failing test**

```javascript
// test/reconcile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { visibleFigures, reconcileDiagnostics } from '../src/reconcile.mjs';
import { renderCase } from '../src/render/render-case.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('extracts figures from rendered text only', () => {
  const figures = visibleFigures('<p data-x="99">72 <span>9</span></p>');
  assert.deepEqual(figures.sort(), ['72', '9'].sort());
});

test('ignores figures inside attributes', () => {
  assert.deepEqual(visibleFigures('<div data-claim="c1" id="ev-3"></div>'), []);
});

test('a faithfully rendered document reconciles', () => {
  const doc = good();
  assert.deepEqual(reconcileDiagnostics(doc, renderCase(doc)), []);
});

test('flags a figure on screen that no claim authorises', () => {
  const doc = good();
  const html = renderCase(doc).replace('>9<', '>4<');
  const d = reconcileDiagnostics(doc, html);
  assert.ok(d.some((x) => x.code === 'render/figure-untraced'));
});

test('the untraced diagnostic names the figure and lists authorised ones', () => {
  const doc = good();
  const html = renderCase(doc).replace('>9<', '>4<');
  const d = reconcileDiagnostics(doc, html).find((x) => x.code === 'render/figure-untraced');
  assert.equal(d.subject.figure, '4');
  assert.ok(Array.isArray(d.evidence.authorised));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/reconcile.test.mjs`
Expected: FAIL — `Cannot find module '../src/reconcile.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/reconcile.mjs
import { claimFigures } from './render/claim-card.mjs';
import { normalizedDiagnostic } from './diagnostics.mjs';

const FIGURE = /\d[\d,]*(?:\.\d+)?/g;

function textOf(html) {
  return html
    .replace(/<[^>]*>/g, ' ')            // drop tags, taking attributes with them
    .replace(/&[a-z]+;|&#\d+;/gi, ' ');  // drop entities
}

export function visibleFigures(html) {
  return [...textOf(html).matchAll(FIGURE)].map((m) => m[0]);
}

function reconcilableRegions(html) {
  const regions = [];
  const re = /<(article|section)\b[^>]*class="[^"]*vs-(?:claim|hero)[^"]*"[^>]*>([\s\S]*?)<\/\1>/g;
  for (const match of html.matchAll(re)) regions.push(match[2]);
  return regions;
}

export function reconcileDiagnostics(doc, html) {
  const authorised = new Set((doc?.claims || []).flatMap(claimFigures));
  const seen = new Set();
  const out = [];

  for (const region of reconcilableRegions(html)) {
    for (const figure of visibleFigures(region)) {
      if (authorised.has(figure) || seen.has(figure)) continue;
      seen.add(figure);
      out.push(normalizedDiagnostic({
        code: 'render/figure-untraced',
        message: `Figure ${JSON.stringify(figure)} appears on screen but no claim authorises it.`,
        subject: { figure },
        evidence: { authorised: [...authorised] },
        supportedFixes: [
          'add a claim to /claims that carries this figure',
          'remove the figure from the rendered content',
        ],
      }));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/reconcile.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/reconcile.mjs test/reconcile.test.mjs
git commit -m "feat: reconcile on-screen figures against authorised claims"
```

---

### Task 12: Validate, deliver, and a self-describing CLI

`validate` orchestrates schema, semantic and reconciliation checks into one receipt. `deliver` renders to a sibling temporary file, verifies, then `rename`s over the target — atomic on the same filesystem, so a failed run leaves the previous good artifact untouched.

`help --json` and `schema` exist so **any** harness can discover the tool without reading source. This is what makes the skill portable beyond Claude Code.

**Files:**
- Create: `src/validate.mjs`
- Create: `src/deliver.mjs`
- Modify: `bin/vs.mjs` — replace with the full command set
- Test: `test/deliver.test.mjs`

**Interfaces:**
- Produces:
  - `validateCase(doc) => { ok: boolean, diagnostics: Diagnostic[] }`
  - `deliverCase(doc, outputPath) => { ok, artifact, specSha256, artifactSha256, bytes, diagnostics }`
  - CLI: `vs help [--json]`, `vs schema`, `vs render <in> <out>`, `vs validate <in> [--json]`, `vs deliver <in> <out> [--json]`

- [ ] **Step 1: Write the failing test**

```javascript
// test/deliver.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCase } from '../src/validate.mjs';

const CLI = fileURLToPath(new URL('../bin/vs.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/example.value-case.json', import.meta.url));
const good = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

test('the fixture passes every gate', () => {
  const result = validateCase(good());
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics, null, 2));
});

test('schema and semantic diagnostics arrive in one receipt', () => {
  const doc = good();
  doc.claims[0].driver = 'differentiation';
  const result = validateCase(doc);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((d) => d.code === 'claim/driver-undeclared'));
});

test('schema failures surface as named domain codes, not generic ones', () => {
  const missingSlot = good();
  delete missingSlot.arc.significance;
  assert.ok(validateCase(missingSlot).diagnostics.some((d) => d.code === 'arc/slot-missing'));

  const noOwner = good();
  delete noOwner.claims[1].assumption.owner;
  const d = validateCase(noOwner).diagnostics.find((x) => x.code === 'claim/estimated-no-owner');
  assert.ok(d, 'missing assumption owner must use its named code');
  assert.match(d.subject.pointer, /\/claims\/1\/assumption\/owner$/);

  const inlineNumber = good();
  inlineNumber.arc.outcome.detail = 'we cut 40 hours';
  assert.ok(validateCase(inlineNumber).diagnostics
    .some((x) => x.code === 'arc/outcome-inline-number'));
});

test('a parse failure yields exactly one diagnostic', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  let stderr = '';
  try {
    execFileSync('node', [CLI, 'validate', bad, '--json'], { stdio: 'pipe' });
    assert.fail('should have exited non-zero');
  } catch (error) {
    stderr = error.stderr.toString();
  }
  const receipt = JSON.parse(stderr);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.diagnostics.length, 1);
  assert.equal(receipt.diagnostics[0].code, 'input/json-parse');
});

test('deliver writes the artifact and reports both hashes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const out = join(dir, 'a.html');
  const receipt = JSON.parse(execFileSync('node', [CLI, 'deliver', FIXTURE, out, '--json']).toString());
  assert.equal(receipt.ok, true);
  assert.match(receipt.specSha256, /^[0-9a-f]{64}$/);
  assert.match(receipt.artifactSha256, /^[0-9a-f]{64}$/);
  assert.ok(existsSync(out));
});

test('a failed delivery preserves the previous artifact and leaves no temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vs-'));
  const out = join(dir, 'a.html');
  execFileSync('node', [CLI, 'deliver', FIXTURE, out]);
  const kept = readFileSync(out, 'utf8');

  const broken = join(dir, 'broken.json');
  const doc = good();
  doc.drivers.primary = 'not-a-driver';
  writeFileSync(broken, JSON.stringify(doc));

  assert.throws(() => execFileSync('node', [CLI, 'deliver', broken, out], { stdio: 'pipe' }));
  assert.equal(readFileSync(out, 'utf8'), kept, 'previous artifact must survive');
  assert.equal(existsSync(`${out}.candidate`), false, 'no temp file may remain');
});

test('help --json describes every command for any harness', () => {
  const help = JSON.parse(execFileSync('node', [CLI, 'help', '--json']).toString());
  assert.equal(help.name, 'value-story');
  const names = help.commands.map((c) => c.name);
  for (const c of ['render', 'validate', 'deliver', 'schema', 'help']) {
    assert.ok(names.includes(c), `help must document ${c}`);
  }
});

test('schema prints the value-case schema as json', () => {
  const schema = JSON.parse(execFileSync('node', [CLI, 'schema']).toString());
  assert.equal(schema.type, 'object');
  assert.ok(schema.properties.claims);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/deliver.test.mjs`
Expected: FAIL — `Cannot find module '../src/validate.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// src/validate.mjs
import schemaValidate from '../generated/validate-value-case.mjs';
import { semanticDiagnostics } from './semantic.mjs';
import { reconcileDiagnostics } from './reconcile.mjs';
import { renderCase } from './render/render-case.mjs';
import { normalizedDiagnostic, applySuppression } from './diagnostics.mjs';

// Map Ajv failures onto the named codes in spec 5.1, so the agent sees a
// domain diagnostic rather than a generic schema error.
function codeFor(error) {
  const p = error.instancePath || '';
  const missing = error.params?.missingProperty;

  if (p === '/arc' && missing) return 'arc/slot-missing';
  if (/^\/arc\/\w+$/.test(p) && missing === 'headline') return 'arc/slot-empty';
  if (p === '/arc/outcome' && error.keyword === 'additionalProperties') {
    return 'arc/outcome-inline-number';
  }
  if (/^\/claims\/\d+$/.test(p)) {
    if (missing === 'tier') return 'claim/tier-missing';
    if (missing === 'baseline' || missing === 'current') return 'claim/measured-no-baseline';
    if (missing === 'assumption') return 'claim/estimated-no-assumption';
    if (missing === 'unit') return 'claim/unit-missing';
    if (error.keyword === 'not') return 'claim/qualitative-has-number';
  }
  if (/^\/claims\/\d+\/assumption$/.test(p) && missing === 'owner') {
    return 'claim/estimated-no-owner';
  }
  if (/\/driver$|\/drivers\/(primary|secondary)/.test(p) && error.keyword === 'enum') {
    return 'driver/unknown';
  }
  if (/\/evidence\/\d+$/.test(p)) return 'evidence/locator-missing';
  return 'schema/invalid';
}

function schemaDiagnostics(doc) {
  if (schemaValidate(doc)) return [];
  return (schemaValidate.errors || []).map((error) => {
    const pointer = error.instancePath || '/';
    const missing = error.params?.missingProperty;
    const target = missing ? `${pointer}/${missing}` : pointer;
    return normalizedDiagnostic({
      code: codeFor(error),
      message: `${target} ${error.message}.`,
      subject: { pointer: target, keyword: error.keyword },
      evidence: error.params || {},
      supportedFixes: [missing
        ? `set ${target} — it is required here`
        : `correct ${target} to satisfy: ${error.message}`],
    });
  });
}

export function validateCase(doc) {
  const schema = schemaDiagnostics(doc);
  if (schema.length) return { ok: false, diagnostics: applySuppression(schema) };

  const semantic = semanticDiagnostics(doc);
  const reconcile = semantic.length ? [] : reconcileDiagnostics(doc, renderCase(doc));
  const diagnostics = applySuppression([...semantic, ...reconcile]);
  return { ok: diagnostics.every((d) => d.severity === 'warning'), diagnostics };
}
```

```javascript
// src/deliver.mjs
import { createHash } from 'node:crypto';
import { writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { validateCase } from './validate.mjs';
import { renderCase } from './render/render-case.mjs';

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

export function deliverCase(doc, outputPath) {
  const result = validateCase(doc);
  if (!result.ok) {
    return { ok: false, artifact: null, diagnostics: result.diagnostics };
  }

  const candidate = `${outputPath}.candidate`;
  const html = renderCase(doc);
  const spec = JSON.stringify(doc);

  try {
    writeFileSync(candidate, html, 'utf8');
    renameSync(candidate, outputPath);
  } catch (error) {
    if (existsSync(candidate)) unlinkSync(candidate);
    throw error;
  }

  return {
    ok: true,
    artifact: outputPath,
    specSha256: sha256(spec),
    artifactSha256: sha256(html),
    bytes: { spec: Buffer.byteLength(spec), artifact: Buffer.byteLength(html) },
    diagnostics: [],
  };
}
```

```javascript
// bin/vs.mjs — replace the whole file
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

const argv = process.argv.slice(2);
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
```

- [ ] **Step 4: Run the full suite**

Run: `node --test test/`
Expected: PASS — every test across all files

- [ ] **Step 5: Commit**

```bash
git add src/validate.mjs src/deliver.mjs bin/vs.mjs test/deliver.test.mjs
git commit -m "feat: add validation receipts, atomic delivery, and self-describing CLI"
```

---

### Task 13: The canonical agent contract — `SKILL.md`

Bounded context: under 150 lines, gating every reference file behind a specific trigger. This file is the single source of truth; Task 14 generates every harness adapter from it.

**Files:**
- Create: `SKILL.md`
- Test: `test/skill.test.mjs`

**Interfaces:**
- Consumes: the CLI from Task 12
- Produces: the canonical contract, consumed by Task 14's generator

- [ ] **Step 1: Write the failing test**

```javascript
// test/skill.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SKILL = readFileSync(fileURLToPath(new URL('../SKILL.md', import.meta.url)), 'utf8');

test('has skill frontmatter with name and description', () => {
  assert.ok(SKILL.startsWith('---\n'));
  assert.match(SKILL, /^name: value-story$/m);
  assert.match(SKILL, /^description: .{40,}$/m);
});

test('stays bounded', () => {
  assert.ok(SKILL.split('\n').length < 150, 'SKILL.md must stay under 150 lines');
});

test('names every prohibited repair', () => {
  for (const phrase of [
    'not a repair for a missing baseline',
    'not a repair for a failing driver',
    'Demoting the primary driver',
    'did not read',
  ]) {
    assert.ok(SKILL.includes(phrase), `missing prohibition: ${phrase}`);
  }
});

test('states the stop condition and the exit-code rule', () => {
  assert.ok(SKILL.includes('new minimum'));
  assert.ok(SKILL.includes('two consecutive rounds'));
  assert.ok(SKILL.includes('non-zero exit'));
});

test('keeps the three truth claims separate', () => {
  assert.ok(SKILL.includes('human judgment'));
});

test('the contract body is delimited for adapter generation', () => {
  assert.ok(SKILL.includes('<!-- contract:start -->'));
  assert.ok(SKILL.includes('<!-- contract:end -->'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/skill.test.mjs`
Expected: FAIL — `ENOENT ... SKILL.md`

- [ ] **Step 3: Write SKILL.md**

```markdown
---
name: value-story
description: Turn an AI initiative's documentation into a validated, self-contained HTML value narrative for leadership. Use when asked to show the business value of a project, build a value case, prepare a roadshow artifact, or map an initiative to value drivers.
license: MIT
metadata:
  version: "0.1"
---

# Value Story

<!-- contract:start -->

Create a self-contained HTML value narrative from a small typed JSON
specification. The audience is leadership. They want business outcomes, not
technology.

Run `node bin/vs.mjs help --json` to discover every command and the receipt
format. Every capability is reachable from the command line; nothing depends on
a particular agent harness.

## Fast authoring path

1. Run `node bin/vs.mjs schema` and read `fixtures/example.value-case.json`.
   Read only those. Use the fixture for field shape, never for facts.
2. Artifact first: the next action must write the candidate JSON. Do not
   inspect renderer or validator source before the first candidate exists.
3. Author the four arc slots from the source material:
   - `problem` — What problem existed?
   - `capability` — What capability did AI unlock?
   - `outcome` — What outcome changed? References claims only.
   - `significance` — Why does it matter to the firm?
4. Validate after every edit:

   ```bash
   node bin/vs.mjs validate <candidate.json> --json
   ```

5. Deliver once, as final acceptance:

   ```bash
   node bin/vs.mjs deliver <candidate.json> <output.html> --json
   ```

Do not read `src/`, `test/`, or `DESIGN.md` before the first candidate. Inspect
implementation only after two focused repairs fail.

## Claim tiers

Every claim declares its evidence strength. Choose the tier the source
supports, never the tier you wish it supported.

| tier | when | requires |
|---|---|---|
| `measured` | a real before and after exist in a cited source | `baseline`, `current`, each with `evidence_ref` |
| `estimated` | a number is inferred or asserted, not measured | `assumption.statement` and `assumption.owner` |
| `qualitative` | a capability changed with no number | `statement`; no numeric fields |

Name a real person in `assumption.owner`. If nobody will own the estimate, it
is not an estimate — make it qualitative.

## Authoring invariants

- One primary driver. It must have at least one claim behind it.
- `outcome` carries claim references only. It has no field for a number.
- Every figure that reaches the page must come from a claim.
- Never write a hex colour, inline style, or `<script>`. The renderer owns
  presentation entirely.
- Preserve exact product names, metric names and units from the source.
- Cite only sources you actually read.

## Repair

On failure, change only the diagnosed `subject`, verify `evidence`, and apply
one fix from `supportedFixes` — each names a JSON Pointer into your document.
Make one structural change per round. Continue while the error count reaches a
**new minimum**; if **two consecutive rounds** do not improve the best count,
stop and report the unresolved diagnostics truthfully.

A **non-zero exit** can never be described as success.

### Prohibited repairs

- Downgrading a `measured` claim to `qualitative` is **not a repair for a
  missing baseline**. Find the number, or state the gap.
- Deleting a claim is **not a repair for a failing driver**.
- **Demoting the primary driver** to escape `driver/primary-no-claim` is not a
  repair.
- Never author an `evidence` entry for a document you **did not read**.

Each of these passes validation by destroying the credibility the artifact
exists to establish.

## Output

Report the artifact path, the validation summary, and the specification and
artifact hashes from the delivery receipt.

`deliver` proves the deterministic artifact checks. It does not prove the
artifact looks right — that is a **human judgment**, and you must not claim it.

<!-- contract:end -->
```

- [ ] **Step 4: Run the full suite**

Run: `node --test test/`
Expected: PASS — all tests

- [ ] **Step 5: Commit**

```bash
git add SKILL.md test/skill.test.mjs
git commit -m "feat: add the canonical agent contract"
```

---

### Task 14: Harness adapters — Claude Code and GitHub Copilot

One contract, several front doors. `SKILL.md` is canonical; the generator derives the Copilot files from its delimited body so the two can never drift. A test fails the build if they do.

GitHub Copilot in VS Code reads `.github/copilot-instructions.md` automatically for every request in the workspace, and exposes `.github/prompts/*.prompt.md` as slash commands in Copilot Chat. Claude Code reads `SKILL.md` from `.claude/skills/value-story/` or `~/.claude/skills/value-story/`. Any other agent uses `vs help --json`.

**Files:**
- Create: `scripts/generate-adapters.mjs`
- Create: `.github/copilot-instructions.md` (generated)
- Create: `.github/prompts/value-story.prompt.md` (generated)
- Create: `README.md`
- Test: `test/adapters.test.mjs`

**Interfaces:**
- Consumes: `SKILL.md` contract body between `<!-- contract:start -->` and `<!-- contract:end -->`
- Produces: `contractBody() => string`; two generated adapter files

- [ ] **Step 1: Write the failing test**

```javascript
// test/adapters.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the generator is idempotent and adapters are in sync with SKILL.md', () => {
  const before = [
    read('../.github/copilot-instructions.md'),
    read('../.github/prompts/value-story.prompt.md'),
  ];
  execFileSync('node', ['scripts/generate-adapters.mjs'], { cwd: root });
  const after = [
    read('../.github/copilot-instructions.md'),
    read('../.github/prompts/value-story.prompt.md'),
  ];
  assert.deepEqual(after, before,
    'adapters are stale — run `npm run build:adapters` and commit the result');
});

test('copilot instructions carry the full contract', () => {
  const copilot = read('../.github/copilot-instructions.md');
  for (const phrase of [
    'not a repair for a missing baseline',
    'did not read',
    'non-zero exit',
    'vs help --json',
  ]) {
    assert.ok(copilot.includes(phrase), `missing: ${phrase}`);
  }
});

test('the copilot prompt file declares its mode', () => {
  const prompt = read('../.github/prompts/value-story.prompt.md');
  assert.match(prompt, /^---$/m);
  assert.match(prompt, /^mode: ['"]?agent['"]?$/m);
  assert.match(prompt, /^description: .+$/m);
});

test('generated files warn against hand editing', () => {
  for (const p of ['../.github/copilot-instructions.md', '../.github/prompts/value-story.prompt.md']) {
    assert.ok(read(p).includes('Generated from SKILL.md'), `${p} must say it is generated`);
  }
});

test('README documents installation for both harnesses', () => {
  const readme = read('../README.md');
  assert.ok(readme.includes('.claude/skills'));
  assert.ok(readme.includes('.github/copilot-instructions.md'));
  assert.ok(readme.includes('vs help --json'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/adapters.test.mjs`
Expected: FAIL — `ENOENT ... .github/copilot-instructions.md`

- [ ] **Step 3: Write the generator and README**

```javascript
// scripts/generate-adapters.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skill = readFileSync(join(root, 'SKILL.md'), 'utf8');

const START = '<!-- contract:start -->';
const END = '<!-- contract:end -->';
const body = skill.slice(skill.indexOf(START) + START.length, skill.indexOf(END)).trim();

if (!body) {
  process.stderr.write('SKILL.md is missing its contract delimiters\n');
  process.exit(1);
}

const BANNER = '<!-- Generated from SKILL.md by scripts/generate-adapters.mjs. Do not edit. -->';

mkdirSync(join(root, '.github', 'prompts'), { recursive: true });

writeFileSync(join(root, '.github', 'copilot-instructions.md'),
`${BANNER}

# Value Story

These instructions apply when working on value narratives in this repository.

${body}
`);

writeFileSync(join(root, '.github', 'prompts', 'value-story.prompt.md'),
`---
mode: agent
description: Build a validated HTML value narrative for an AI initiative.
---
${BANNER}

Build a value narrative for the initiative I name. Follow this contract exactly.

${body}
`);

process.stdout.write('.github/copilot-instructions.md\n.github/prompts/value-story.prompt.md\n');
```

```markdown
<!-- README.md -->
# Value Story

Turn an AI initiative's documentation into a validated, self-contained HTML
value narrative for leadership.

## Requirements

Node 22 or newer. No runtime dependencies — nothing to install to run it.

## Use it from the command line

```bash
node bin/vs.mjs help --json
node bin/vs.mjs schema
node bin/vs.mjs validate my-case.json --json
node bin/vs.mjs deliver  my-case.json out.html --json
open out.html
```

Every capability is reachable this way, so the tool works from any agent, any
editor, or a bare terminal.

## Use it from Claude Code

Copy or symlink this directory into your skills folder:

```bash
# this project only
mkdir -p .claude/skills && ln -s "$PWD" .claude/skills/value-story

# or everywhere
ln -s "$PWD" ~/.claude/skills/value-story
```

Claude Code reads `SKILL.md` and invokes the CLI. Ask for a value narrative and
it will author, validate and deliver the artifact.

## Use it from GitHub Copilot

Two entry points, both generated from the same `SKILL.md`:

- **`.github/copilot-instructions.md`** — VS Code applies this automatically to
  every Copilot request made in this workspace. Nothing to enable.
- **`.github/prompts/value-story.prompt.md`** — type `/value-story` in Copilot
  Chat (agent mode) to run the full workflow.

To use it from a different repository, copy `.github/copilot-instructions.md`
there and keep this project on disk so the CLI stays reachable.

## Use it from any other agent

Point the agent at `SKILL.md` and tell it to run `node bin/vs.mjs help --json`.
The help output describes every command and the repair-receipt format, so no
agent needs to read source to use the tool.

## Keeping the adapters in sync

`SKILL.md` is the single source of truth. After editing it:

```bash
npm run build:adapters
```

`test/adapters.test.mjs` fails if the generated files are stale.
```

- [ ] **Step 4: Generate the adapters and run the full suite**

```bash
node scripts/generate-adapters.mjs
node --test test/
```

Expected: two paths printed; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-adapters.mjs .github/ README.md test/adapters.test.mjs
git commit -m "feat: generate Claude Code and Copilot adapters from one contract"
```

---

**M1 exit gate.** An agent — in Claude Code or Copilot — can author a second initiative end to end without hand-holding, and every failure returns a JSON Pointer it can act on.

---

# MILESTONES 2-4 — Lower resolution

These are sketched, not specified. Write a detailed plan for each when its predecessor's exit gate is met — the design will have moved by then.

### M2 — Extraction and the manifest

Roughly five tasks. A reader for `.docx`, `.pptx`, `.pdf` and exported `.eml`/`.txt` threads; an `evidence-manifest.json` writer capturing `{path, title, date, sha256}` per ingested file; the `evidence/not-in-manifest` check wired into `validate`; extraction guidance appended to `SKILL.md` (and therefore into both adapters automatically); and an accuracy harness over several real initiatives.

Highest-risk milestone. Its central question is not parsing but **judgment**: deciding whether a number in a status report is measured or asserted. Expect most of the effort to go into tier-assignment guidance and into reviewing what extraction produces.

The manifest is what makes fabricated citations impossible, so it is neither optional nor deferrable to M3.

Parsing `.docx`/`.pptx`/`.pdf` will require dependencies. Keep them **devDependencies of an extraction subpackage**, so the renderer's zero-dependency guarantee survives — the two stages already run separately.

### M3 — The visual gate

Roughly three tasks. Playwright as a devDependency; `vs visual-check <output.html> --json` loading the **delivered** file without re-rendering it; overflow assertions at 1440×900, 1600×1000 and 1920×1080; graduated fix messages that state what not to do. Contrast, collision and above-the-fold checks follow once the layout has stopped moving.

### M4 — Portfolio

Roughly three tasks. `value-portfolio.schema.json` referencing case files; a coverage renderer reusing the constellation mark at portfolio scale; per-driver counts and tier breakdowns.

**It must never sum across tiers.** "How much productivity?" is answered as *"four initiatives, two measured, two estimated."* If a future request asks for a single number, that is a change to the spec, not a change to the renderer.

---

## Appendix: running everything

```bash
npm test                                                    # full suite
node scripts/generate-validators.mjs                        # after any schema change
node scripts/generate-adapters.mjs                          # after any SKILL.md change
node bin/vs.mjs validate fixtures/example.value-case.json --json
node bin/vs.mjs deliver  fixtures/example.value-case.json /tmp/vs.html --json
open /tmp/vs.html
```

After changing a schema, **always** regenerate the validators and commit `generated/` — it is source, not build output, because the runtime has no dependencies. After changing `SKILL.md`, always regenerate the adapters; the test suite fails if they are stale.
