---
name: value-story
description: Turn an AI initiative's documentation into a validated, self-contained HTML value narrative for leadership. Use when asked to show the business value of a project, build a value case, prepare a roadshow artifact, or map an initiative to value drivers.
metadata:
  version: "0.1"
---

# Value Story

<!-- contract:start -->

Create a self-contained HTML value narrative from a small typed JSON specification.
The audience is leadership. They want business outcomes, not technology.

Run `node bin/vs.mjs help --json` to discover every command and the receipt format.

## What leadership asks

Hunt for claims answering all five. **Risk and reach are the two that get missed**: cost and time figures sit on the surface of a status report, control-exception counts and headcount reach do not. Look for those two specifically. Report which of the five you could not answer — never quietly answer three and present it as five.

1. How much productivity? → `productivity`, `operational-adaptability`
2. How much risk reduced? → `governance-oversight`, `standardization-knowledge` — control exceptions, error rates, audit findings, `direction: decrease`
3. What new capabilities? → `capability.novelty` plus `qualitative` claims
4. How much cost avoided? → the four Efficiency drivers
5. How many employees or functions enabled? → headcount or function counts, `unit` of people or functions

`metric` and `unit` are free strings, so each of these is an ordinary claim. If the sources do not support one, say so rather than invent it.

## Reading the sources

```bash
node bin/vs.mjs ingest <sources> --out <dir> --json
```

Extracts readable text into `<dir>`, one file per document, plus `<dir>/evidence-manifest.json` — the record of what was read.
Read that text before authoring anything. A skipped file is absent from the manifest because it was never read; do not cite it.

## Fast authoring path

1. Run `node bin/vs.mjs schema` and read `fixtures/example.value-case.json`. Read only those. Use the fixture for field shape, never for facts.
2. Artifact first: the next action must write the candidate JSON. Do not inspect renderer or validator source before the first candidate exists.
3. Author the four arc slots from the source material:
   - `problem` — What problem existed?
   - `capability` — What capability did AI unlock?
   - `outcome` — What outcome changed? References claims only.
   - `significance` — Why does it matter to the firm?
4. Validate after every edit, and deliver once as final acceptance. Always pass the manifest: without it no citation is checked, and the receipt says so.

   ```bash
   node bin/vs.mjs validate <case.json> --manifest <dir>/evidence-manifest.json --json
   node bin/vs.mjs deliver  <case.json> <out.html> --manifest <dir>/evidence-manifest.json --json
   ```

Do not read `src/`, `test/`, or `DESIGN.md` before the first candidate. Inspect implementation only after two focused repairs fail.

## Claim tiers

Every claim declares its evidence strength. Choose the tier the source supports, never the tier you wish it supported.

| tier | when | requires |
|---|---|---|
| `measured` | a real before and after exist in a cited source | `baseline`, `current`, each with `evidence_ref` |
| `estimated` | a number is inferred or asserted, not measured | `assumption.statement` and `assumption.owner` |
| `qualitative` | a capability changed with no number | `statement`; no numeric fields |

**The test: could someone re-run the query and get the same number?** If yes, `measured`. If no, `estimated`.

`measured` requires the cited source to REPORT the figure as an observation — a dataset, a metered reading, a counted extract, a query with an answer behind it. A figure stated in a deck, a status update, a proposal or an email with nothing behind it is `estimated`, and it needs a named owner. When neither holds it is `qualitative`, or it is not a claim at all.

Name a real person in `assumption.owner` — one the source actually names, never an invented plausible-sounding one. If nobody will own the estimate, it is not an estimate — make it qualitative.

## Reading a portfolio record

Most source records are early-stage: a rubric score, an assumed rating, an unquantified benefit. A line like *"no reach evidence stated; assumed departmental, the portfolio norm"* is itself evidence — evidence of an ASSUMPTION, not of an outcome. A rubric score is a prioritisation judgement, never a business result, and must never become a `measured` claim. Promoting "efficiency 4" to a measured figure fabricates a business result out of a routing decision.

## Authoring invariants

- One primary driver. It must have at least one claim behind it.
- `outcome` carries claim references only. It has no field for a number.
- Every figure that reaches the page must come from a claim.
- Never write a hex colour, inline style, or `<script>`. The renderer owns presentation entirely.
- Preserve exact product names, metric names and units from the source.
- Cite only sources you actually read.
- If the sources do not support a chapter, say so plainly in your report rather than filling it with prose the evidence does not carry.
- An outcome chapter carrying only `qualitative` claims is a **correct outcome, not a failure**. Say so in the headline. Naming the gap precisely is more useful to leadership than a manufactured number, and the tool rejects the manufactured number anyway.
- Numerals are traced inside claim cards and the hero, and nowhere else.
- `arc.outcome.headline` is traced **only when it reaches the hero** — which happens when `outcome` references a measured or estimated claim. With no such claim there is no hero, the headline falls back to its own chapter, and nothing checks it.
- Never checked at all: the other chapter headlines and details, evidence titles, the initiative name.
- So put no figure in any headline or in prose. A figure that matters belongs in a `claim`, with a tier and evidence.

## Repair

On failure, change only the diagnosed `subject`, verify `evidence`, and apply one fix from `supportedFixes` — each names a JSON Pointer into your document.
Make one structural change per round. Continue while the error count reaches a **new minimum**; if **two consecutive rounds** do not improve the best count,
stop and report the unresolved diagnostics truthfully.

A **non-zero exit** can never be described as success.

### Prohibited repairs

- Downgrading a `measured` claim to `qualitative` is **not a repair for a missing baseline**. Find the number, or state the gap.
- Deleting a claim is **not a repair for a failing driver**.
- **Demoting the primary driver** to escape `driver/primary-no-claim` is not a repair.
- Never author an `evidence` entry for a document you **did not read**.
- Removing or rewording a numeral to make **any** diagnostic pass is not a repair. If the figure is real, promote the claim to `measured` or `estimated` and cite evidence; if it is not real, remove the claim and say so. Rewording hides the same unsourced number under different words.

Each of these passes validation by destroying the credibility the artifact exists to establish.

## Output

Report the artifact path, the validation summary, and the specification and artifact hashes from the delivery receipt.

## The gate

```bash
node bin/vs.mjs visual-check <out.html> --json
```

Measures the DELIVERED artifact in a real browser at three desk sizes: horizontal overflow, WCAG contrast, text collision,
and the hero delta above the fold. Scrolling down is never a finding. Repair its `layout/…` findings like any other.

Overflow repairs are graduated on the measured pixels, and each band says what NOT to do:

- **≤ 40px over** — tighten one gap or padding by 20-40px; do not remove content.
- **41-200px over** — move a supporting element to the next chapter; do not shrink the hero numeral.
- **over 200px** — the layout is wrong for this content: report it rather than compressing it.

Contrast is a token change in `src/render/tokens.mjs` — not a per-element override. The palette is centralised, so an
override patches one instance and leaves the defect in place.

### Counterfeit passes

**Never: no `overflow:hidden`, no clipped content, no internal scroller, no reduced typography to pass the gate.**
Each makes the measurement pass while making the artifact worse — the visual form of rewording a numeral away.

The findings array is capped per viewport. Read `summary` for what was measured: "15 of 36", never a bare 15.

## Three claims, never merged

`deliver` proves the deterministic artifact checks. It does not prove the
artifact looks right — that is a **human judgment**, and you must not claim it.

`visual-check` proves bounded behaviour in a real browser. That is all it proves:
whether the artifact is any good remains a **human judgment**, and the tool never claims it.

<!-- contract:end -->
