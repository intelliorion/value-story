# Value Story — Design

**Date:** 2026-09-13
**Status:** Approved design, pre-implementation
**Author:** johnny.hao@intelliorion.com

---

## 1. Purpose

Turn a project's existing documentation into a validated, visually exceptional,
self-contained HTML narrative that answers leadership's questions about the
business value of an AI initiative.

The audience is fixed and known. Nigel wants business value immediately, not
technology. Sean has stated the framing he wants every initiative to use:

> Don't say: "We built a GenAI solution."
> Instead say: "We reduced turnaround time from X to Y, increased capacity by
> X%, improved controls, and enabled a capability that did not exist before."

The tool exists to make that framing the only one the artifact can express.

### What this is not

- Not a measurement system of record. It does not own value data over time,
  does not track metrics across reporting periods, and does not reconcile.
- Not a general diagramming tool.
- Not a slide generator. The output is one HTML artifact per initiative.

---

## 2. Constraints

| Constraint | Value |
|---|---|
| Runtime | Claude Code skill + Node renderer, local machine |
| Evidence sources | Project docs (decks, specs, status reports), email and Teams threads |
| Output | One self-contained HTML file per initiative |
| Dependencies | None at render time. No npm runtime deps, no CDNs |
| Language | English only in v1 |

Source documents contain claims, not measurements. This is the defining
constraint of the design: the acceptance criterion is quantified, but the
evidence base is prose. Section 4 resolves this with typed claim strength
rather than by relaxing the standard or by blocking output.

---

## 3. Architecture

Two stages with a human review gate between them.

```
docs + email threads
        |
        v
  [extract skill]  ──▶  value-case.json  +  evidence-manifest.json
                              |
                        human review  ◀── correction happens here
                              |
                              v
                        [validate]  ──▶ repair receipt ──┐
                              |                          │
                              | pass                     │ agent self-corrects
                              v                          │
                        [render + deliver]  ◀────────────┘
                              |
                              v
                        artifact.html
                              |
                              v
                       [visual-check]
```

The two stages fail differently and are therefore separated. Extraction is
judgment under ambiguity — reading a messy deck and deciding whether a number
is measured or asserted. Rendering is deterministic. Putting a reviewable JSON
checkpoint between them means a misattributed figure is corrected in seconds at
the source, rather than discovered on a slide in front of leadership.

The pattern is taken from `tt-a1i/archify` (MIT): typed JSON IR, deterministic
renderer, machine-readable repair receipts. Archify's code is not forked. Its
renderers are geometry engines for routed graphs; this artifact is typography,
a driver tree, and a small number of charts. The disciplines are copied; the
implementation is our own.

---

## 4. The intermediate representation

Two schemas. `value-case` is the substance; `value-portfolio` is thin and
references cases.

### 4.1 `value-case.schema.json`

```jsonc
{
  "schema_version": 1,
  "meta":       { "title", "owner", "period",
                  "quality_profile": "draft | showcase",
                  "motion": "static | entry" },
  "initiative": { "id", "name", "sponsor", "function", "status" },

  "drivers":    { "primary": "<one of the ten>", "secondary": ["…"] },

  "arc": {
    "problem":      { "headline", "detail", "evidence_refs": [] },
    "capability":   { "headline", "detail", "evidence_refs": [],
                      "novelty": "first-of-kind | incremental | reusable" },
    "outcome":      { "headline", "claim_refs": [] },
    "significance": { "headline", "detail" }
  },

  "claims":   [ /* 4.3 */ ],
  "evidence": [ /* 4.4 */ ]
}
```

All dates are ISO 8601: `YYYY-MM` for claim periods, `YYYY-MM-DD` for evidence
dates.

### 4.2 `arc` — the fixed four-slot narrative

`arc` is an object with exactly four required slots, not an ordered array. The
slots are Sean's four questions:

1. `problem` — What problem existed?
2. `capability` — What capability did AI unlock?
3. `outcome` — What outcome changed?
4. `significance` — Why does it matter to the firm?

The structure cannot be reordered, extended, or partially filled. These are not
a suggested outline; they are the contract the audience has already stated, so
the schema enforces them.

`outcome` carries **only** references to claims. It has no free-text field in
which a number may be written. This is the structural mechanism that makes the
"don't say we built a GenAI solution" rule mechanically true rather than
aspirational: the outcome chapter is physically incapable of holding an
unsourced assertion.

### 4.3 `claims[]` — typed claim strength

```jsonc
{
  "id": "c1",
  "driver": "labor-cost-efficiency",
  "metric": "case turnaround time",
  "unit": "hours",
  "tier": "measured",
  "baseline": { "value": 72, "asof": "2026-01", "evidence_ref": "e3" },
  "current":  { "value": 9,  "asof": "2026-08", "evidence_ref": "e3" },
  "direction": "decrease"
}
```

The two non-measured tiers carry different fields in place of
`baseline`/`current`:

```jsonc
// tier: "estimated"
{ "id": "c2", "driver": "productivity", "metric": "reviewer capacity",
  "unit": "cases/week", "tier": "estimated",
  "baseline": { "value": 40, "asof": "2026-01" },
  "current":  { "value": 55, "asof": "2026-08" },
  "direction": "increase",
  "assumption": { "statement": "assumes steady case mix across both periods",
                  "owner": "…" } }

// tier: "qualitative"
{ "id": "c3", "driver": "governance-oversight", "tier": "qualitative",
  "statement": "every decision now carries an auditable rationale trail",
  "evidence_ref": "e5" }
```

(Synthetic values throughout this document; no measured figures from any real
initiative appear here.)

`tier` determines which fields are mandatory and how the claim renders.

| tier | required fields | rendering |
|---|---|---|
| `measured` | `baseline` and `current`, each with a resolving `evidence_ref` | full delta treatment; the hero numeral |
| `estimated` | `assumption.statement` and `assumption.owner` | same shape, visibly marked, owner named |
| `qualitative` | `statement`; numeric fields forbidden | capability card; no numeric styling |

Requiring an owner on every estimate is deliberate. An estimate with a named
person attached survives scrutiny in a room; an orphan estimate does not. It
also answers "who says?" before the question is asked.

### 4.4 `evidence[]` — the provenance registry

```jsonc
{
  "ref": "e3",
  "kind": "doc | email | dataset | interview",
  "title": "Sandbox PoC results",
  "author": "…",
  "date": "2026-07-20",
  "locator": "slide 12",
  "quote": "optional verbatim snippet"
}
```

Every `evidence_ref` and `claim_ref` anywhere in the document must resolve to an
entry here. A dangling reference is a hard error.

### 4.5 The value drivers

Fixed enumeration, set by stakeholders. Not extensible by the tool.

**Effectiveness:** Productivity · Operational Adaptability · Governance &
Oversight · Standardization & Knowledge · High-Value Skills & IP ·
Differentiation

**Efficiency:** Labor Cost Efficiency · Process Cost Efficiency · Overhead Cost
Efficiency · CapEx Reduction

Each initiative names exactly one `primary` driver and any number of
`secondary` drivers. Requiring a single primary forces the "what is this really
for" conversation rather than permitting a diffuse claim on everything.

### 4.6 Invariants

1. All four `arc` slots present and non-empty.
2. Every `claim.driver` is in `primary` ∪ `secondary`.
3. The primary driver has at least one claim.
4. Every `measured` claim's `baseline` and `current` resolve to real evidence.
5. Every number rendered on screen traces to a `claim` id.

Invariant 3 closes the most common way these artifacts mislead: declaring a
strategic primary driver with nothing behind it.

Invariant 5 is reconciliation, adapted from `Vincentwei1021/anything2explainer`.
The renderer extracts every numeric string literal reaching the page and checks
it against the claim set. Schema validation structurally cannot catch an
invented figure; this can.

### 4.7 `value-portfolio.schema.json`

A list of case references plus a coverage view. It computes nothing that was not
already stated. For each of the ten drivers it reports how many initiatives name
it primary, how many name it secondary, and the tier breakdown of their claims.

"How much productivity?" is answered as *"four initiatives, two measured, two
estimated"* — not as a summed number that cannot be defended. Measured,
estimated, and qualitative claims are not arithmetically compatible, and the
portfolio view does not pretend otherwise.

### 4.8 The five leadership questions

Leadership asks five questions of the portfolio. They are a DIFFERENT taxonomy
from the ten drivers, and the mapping between them is not one-to-one. It is
specified here so the portfolio view (M4) implements a decision rather than an
assumption, and so extraction (M2) knows what to hunt for.

| Question | Answered by | Claim shape to look for |
|---|---|---|
| How much productivity? | `productivity`, `operational-adaptability` | throughput, cycle time, cases per person |
| How much risk reduced? | `governance-oversight`, `standardization-knowledge` | control exceptions, error/defect rate, audit findings — `direction: decrease` |
| What new capabilities? | `arc.capability.novelty` + `qualitative` claims | capability statements; `novelty: first-of-kind` or `reusable` |
| How much cost avoided? | the four Efficiency drivers | currency-unit claims |
| How many employees/functions enabled? | `productivity`, `high-value-skills-ip` | headcount or function counts — `unit` of people or functions |

Three consequences:

1. **No schema change is required.** Every one of these is expressible as an
   ordinary claim; `metric` and `unit` are free strings by design. The gap was
   never in the IR.
2. **Risk has no driver of its own.** The stakeholders' ten-driver taxonomy
   contains none, so risk answers route through Governance & Oversight. This is
   inherited from their framework, not introduced here, and should be confirmed
   with them rather than silently reinterpreted.
3. **The portfolio view must report per question, not only per driver.**
   Reporting driver coverage alone answers "which drivers do we touch," which is
   not what was asked.

Extraction (M2) and `SKILL.md` (M1) must prompt for reach and risk figures
explicitly. Left to inference, an extractor finds the cost and time numbers that
sit on the surface of a status report and silently omits these two.

---

## 5. Diagnostics

The envelope is Archify's, copied deliberately:

```jsonc
{
  "code": "claim/estimated-no-owner",
  "severity": "error",
  "message": "Estimated claim \"case turnaround time\" does not name who made the estimate.",
  "subject":  { "collection": "claims", "index": 2, "id": "c3", "tier": "estimated" },
  "evidence": { "hasAssumptionStatement": true, "ownerField": "assumption.owner" },
  "supportedFixes": [ "set /claims/2/assumption/owner to the person who made this estimate" ],
  "suppresses": [ ]
}
```

`supportedFixes` entries are JSON Pointers. The agent writes to an address; it
does not interpret advice. Diagnostics are normalized so a malformed diagnostic
can never reach the agent as a malformed diagnostic: unknown severity coerces to
`error`, missing code to `internal/unclassified`, `supportedFixes` is deduped.

A crash boundary on `uncaughtException` emits a valid diagnostic envelope to
stderr synchronously and exits non-zero. The agent never sees a stack trace.
Parse failures and unreadable inputs are classified into the same shape with
real `supportedFixes`.

### 5.1 Codes

```
input/json-parse            input/read                  internal/unclassified
output/write                schema/invalid

arc/slot-missing            arc/slot-empty              arc/outcome-inline-number
driver/primary-no-claim     driver/unknown              driver/secondary-shadows-primary
claim/tier-missing          claim/driver-undeclared     claim/unit-missing
claim/measured-no-baseline  claim/measured-no-evidence  claim/estimated-no-assumption
claim/estimated-no-owner    claim/qualitative-has-number
claim/direction-mismatch    claim/duplicate-id
evidence/ref-unresolved     evidence/duplicate-ref      evidence/not-in-manifest
evidence/manifest-stale
render/figure-untraced      render/region-nested
motion/budget-exceeded
layout/overflow             layout/collision
```

`claim/measured-no-evidence` enforces invariant 4 of §4.6 and the `measured`
row of the §4.3 table: a `measured` claim whose `baseline` or `current` carries
no `evidence_ref` is an estimate wearing the measured treatment. It is emitted
by the semantic layer rather than the schema, because only there is the claim's
tier in scope — an `estimated` claim's points legitimately carry no citation
(they carry a named assumption owner instead), so the schema cannot make
`evidence_ref` required on a point.

`output/write` is an OUTPUT fault: the document validated, and the artifact
could not be written to the destination given. Its `subject` names that
destination. It must never be reported as an input fault.

`evidence/not-in-manifest` and `evidence/manifest-stale` are LIVE. Both are
opt-in: they fire only when a manifest is supplied (`--manifest <path>` on
`validate` and `deliver`), because a hand-authored case remains legitimate.
Silence is therefore not evidence of verification, so the delivery receipt
carries `citationsVerified` — false whenever no manifest was given.

`evidence/not-in-manifest` matches `evidence[].title` against the manifest
EXACTLY. A title differing only in case or spacing is reported, not accepted:
its diagnostic lists the closest manifest titles in `evidence.candidates` so
the repair is mechanical, and `supportedFixes` names the JSON Pointer of the
offending entry. Auto-resolving a near match is the one behaviour this code
exists to prevent.

`evidence/manifest-stale` fires for a CITED document only — reading more than
you cite is normal, and an uncited row that changed is nobody's problem. When
the file is still on disk and its SHA-256 no longer matches, it is an ERROR:
the quote or locator may no longer be in the document. When the file has moved
or been deleted it is a WARNING carrying `evidence.condition: "file-missing"` —
the document genuinely was read, and deleting it afterwards does not un-read
it, so the citation stands on the manifest's record and delivery is not blocked.

A malformed or schema-invalid manifest reports `schema/invalid` with
`subject.manifest` naming the manifest file, rather than a code of its own: the
fault is exactly what `schema/invalid` already means.

`motion/budget-exceeded` belongs to M3 with `layout/overflow` and
`layout/collision`: §6.3 describes it in the present tense, but nothing emits
it yet.

`evidence/locator-missing` was removed: `locator` is optional in §4.4, so the
code could never fire for its stated meaning. A schema failure on an evidence
item now reports `schema/invalid` with the exact pointer, rather than asserting
a cause that is not the cause.

### 5.2 The manifest

The principal risk in this domain is not a layout bug. It is the agent
inventing an `evidence[]` entry to satisfy a dangling reference — easier than
admitting a gap, and undetectable downstream.

The extraction stage therefore emits `evidence-manifest.json`: every document
and thread actually ingested, with path, title, date, and SHA-256.
`evidence/not-in-manifest` fires when a citation names a source that was never
read.

**You cannot cite what you did not read.** Extraction is consequently the only
route by which a document enters the system; citations cannot be hand-added
from memory without registering the source.

### 5.3 Suppression

| Root code | Suppresses |
|---|---|
| `input/json-parse` | all other diagnostics |
| `driver/unknown` | `claim/driver-undeclared` |
| `arc/slot-missing` | all `render/*` for that chapter |
| `evidence/ref-unresolved` | `claim/measured-no-baseline` for the same claim |

Without suppression one root cause produces dozens of cascading errors and the
agent repairs symptoms.

Diagnostic recording is suppressed during speculative internal work, so
failures the renderer already recovered from do not reach the receipt. Only
failures that survived are reported.

### 5.4 Prohibited repairs

Each of these is the path of least resistance for a model under repair
pressure, and each destroys the credibility the artifact exists to establish.
They are enumerated individually in `SKILL.md`; a general instruction to be
honest does not work.

- Downgrading a `measured` claim to `qualitative` is not a repair for a missing
  baseline. Find the number or state the gap.
- Deleting a claim is not a repair for a failing driver.
- Demoting the primary driver is not a repair for `driver/primary-no-claim`.
- Authoring an `evidence` entry for a document that was not read is prohibited
  without exception.
- Removing or rewording a numeral to make any diagnostic pass is not a repair.
  `supportedFixes` therefore never offers it: `render/figure-untraced` offers
  promotion to `measured`/`estimated` with cited evidence, or removal of the
  CLAIM with that stated in the report.

### 5.5 The repair loop

Change only the diagnosed `subject`. Verify `evidence`. Choose from
`supportedFixes`. One structural change per repair round. Continue while the
objective error count reaches a new minimum; if two consecutive rounds do not
improve the best count, stop and report the unresolved diagnostics truthfully.

A non-zero exit is never described as success.

---

## 6. Visual system

The requirement is that the artifact be visually exceptional. An aspiration in
a spec produces nothing, so it is encoded in four enforceable mechanisms.

### 6.1 Tokens — `DESIGN.md`

YAML frontmatter design tokens followed by prose, consumed directly by the
renderer: color, type scale, spacing, radii, elevation, motion curves. The
agent cannot author a hex value; it selects semantic classes. This is what makes
fifty artifacts look like one product rather than fifty moods.

### 6.2 Visual vocabulary

Small and fixed, which is what makes it possible to make it excellent.

**The delta is the hero.** One large number transition — baseline to current —
in a tight display face, animated once on entry, with the baseline ghosted
behind. This frame must land within two seconds. Everything else supports it.

**Evidence tier is the visual language**, not a footnote:

| tier | treatment |
|---|---|
| `measured` | solid fill, full contrast, hero numeral, citation chip on hover |
| `estimated` | hairline dashed containment, owner name set beneath in small caps |
| `qualitative` | no numeral; a distinct mark that cannot be misread as a measurement |

A skeptical viewer distinguishes measured from estimated across a room without
reading. This is simultaneously the credibility mechanism and the reason the
artifact reads as designed rather than generated.

**The driver constellation.** Ten drivers in two groups; primary lit,
secondaries dim, untouched drivers present but dark. The portfolio view repeats
the same mark, so both artifacts share one visual identity and the audience
learns to read a single chart.

**Register.** Dark, editorial, high contrast, generous negative space, one
accent, restrained type palette. Explicitly not corporate-deck blue and grey.

### 6.3 Motion budget

Effects are a declared allowance counted by the validator;
`motion/budget-exceeded` fires when an artifact exceeds its profile.

The governing rule, adopted from Archify:

> Static meaning must remain complete. Motion is finite and reader-controlled.
> Exports stay clean.

Every animation runs once, on entry, and resolves. Nothing loops, pulses, or
bounces. `prefers-reduced-motion` is honored. The print path carries zero motion
and loses no meaning — a material requirement, since much of the audience
receives the artifact forwarded rather than presented.

### 6.4 `FINGERPRINTS.md`

An explicit catalogue of what makes output read as machine-generated, avoided by
name: gradient on every surface, emoji as iconography, three-column feature
grids, generic stock icons, centered everything, purple-to-blue gradients,
rounded pills on every control. A cheap file with disproportionate effect.

### 6.5 The gate — `visual-check`

Playwright loads the delivered HTML — without modifying or re-rendering it — and
measures:

- `scrollWidth <= innerWidth` at 1440×900, 1600×1000 and 1920×1080.
  `scrollHeight` is recorded but is never a finding — a value narrative is
  expected to run several screens tall; only horizontal overflow indicates
  a broken layout.
- text and background contrast against the token palette
- label and mark collision
- the hero delta is above the fold at every checked size

Failures return graduated fixes that state what not to do, after
`op7418/guizang-ppt-skill`:

```
40px over   → tighten one gap or padding by 20-40px; do not remove content
200px over  → move a supporting card to the second chapter; do not shrink the hero numeral
```

Counterfeit passes are prohibited by name: no `overflow: hidden`, no clipped
content, no internal scroller, no reduced typography.

### 6.6 Three separate claims

Never conflated:

- `deliver` proves the deterministic artifact checks.
- `visual-check` proves bounded behavior in a real browser.
- Whether the artifact produces the intended reaction is a human judgment, and
  the tool never claims it.

---

## 7. Milestones

### M0 — prove the visual

Select one real initiative with genuine before/after numbers. Hand-author its
`value-case.json`. Build the renderer against that single fixture and iterate on
the visuals until the result lands. No extraction, no validators.

This inverts the obvious order deliberately, applying Archify's "artifact first"
rule to the project itself. If the visual does not produce the intended
reaction, no amount of schema rigor rescues it — and that is better learned in
days than in weeks. The renderer is kept; the hand-written JSON becomes the test
fixture. Authoring the IR by hand also validates §4: a field that is awkward to
fill in is wrong.

**Exit:** show it to Sean.

### M1 — freeze the contract

Schemas, precompiled Ajv validators (`allErrors`, `strict`, standalone code
generation so there is no runtime schema dependency), the diagnostics module,
the `arc/`, `claim/`, `driver/` and `evidence/` codes, and `deliver` with atomic
commit. A second initiative can now be authored by the agent rather than by
hand.

### M2 — extraction and manifest

The document and thread reader, `evidence-manifest.json`, and
`evidence/not-in-manifest`. Highest-risk stage, deliberately sequenced after the
contract exists so that extraction has a fixed target and a validator to judge
it.

### M3 — the visual gate

`visual-check` with overflow at three viewport sizes. Contrast, collision and
above-the-fold checks follow once the layout has stabilized.

### M4 — portfolio

`value-portfolio` and the coverage view, once several cases exist. Building a
roll-up before there is anything to roll up designs for imaginary data.

### Out of scope for v1

| Excluded | Reason |
|---|---|
| Light theme | One theme done excellently beats two done adequately |
| PNG/SVG/WebM export | Browser print-to-PDF covers forwarding |
| Pan/zoom, search, deep links, presentation mode | A four-chapter narrative is read, not explored |
| Multi-locale | English only |
| Mermaid-style input conversion | No analogue in this domain |
| Motion beyond entry animation | Already the §6.3 rule; named here to prevent creep |

---

## 8. Risks

**The M0 fixture determines the outcome of the experiment.** An initiative
without measured numbers yields an artifact of dashed outlines and owner names —
honest, but unpersuasive — and would produce the false conclusion that the
design failed. Select the initiative with the hardest evidence available, even
if it is not the most strategically interesting.

**Extraction quality is the product risk.** The renderer is a solved problem
once the tokens are fixed. Reading an ambiguous deck and correctly assigning
`measured` against `estimated` is not, and is where the effort will actually go.
M2's late position is intentional, but its brevity in this document should not
be read as smallness.

**Upstream reference churn.** `tt-a1i/archify` is a single-maintainer project
under rapid development. It is a reference, not a dependency; nothing here
imports from it. The local clone at `~/github/archify` is pinned by checkout and
should not be updated casually.

---

## 9. Decisions required before M0

1. **Which initiative is the M0 fixture**, and whether it has real before/after
   numbers. Owner: Johnny.
2. **Whether Sean and Majid review this design before build.** The value-driver
   taxonomy is theirs; the claim-tier model and the evidence standard are new
   and carry organizational consequences — particularly the requirement to name
   an owner for every estimate.

---

## 10. Sources

- `tt-a1i/archify` (MIT) — typed IR, diagnostic envelope, delivery gates,
  bounded-context skill design. Cloned for reference at `~/github/archify`.
- `Vincentwei1021/anything2explainer` — on-screen claim reconciliation against a
  fact list; motion budget.
- `op7418/guizang-ppt-skill` (AGPL-3.0, reference only, no code reuse) —
  Playwright measurement with graduated, content-preserving fix messages.
- `nateherkai/scroll-craft` (MIT) — the `FINGERPRINTS.md` anti-pattern file.
- `Rich627/slides-skill` (MIT) — reference decomposition into design system,
  component catalogue and storyline catalogue.
