---
name: value-story
description: Turn an AI initiative's documentation into a validated, self-contained HTML value narrative for leadership. Use when asked to show the business value of a project, build a value case, prepare a roadshow artifact, or map an initiative to value drivers.
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

## What leadership asks

Actively look for claims answering all five questions. Two are easy to miss
because the numbers do not sit on the surface of a status report:

1. How much productivity? → `productivity`, `operational-adaptability`
2. How much risk reduced? → `governance-oversight`, `standardization-knowledge`
   (control exceptions, error rates, audit findings, with `direction: decrease`)
3. What new capabilities? → `capability.novelty` plus `qualitative` claims
4. How much cost avoided? → the four Efficiency drivers
5. How many employees or functions enabled? → headcount or function counts,
   with `unit` of people or functions

No schema change is needed for any of these: `metric` and `unit` are free
strings, so each is an ordinary claim. If the sources do not support one, say
so rather than invent it.

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

Name a real person in `assumption.owner` — one the source actually names, never an invented plausible-sounding one. If nobody will own the estimate, it is not an estimate — make it qualitative.

## Authoring invariants

- One primary driver. It must have at least one claim behind it.
- `outcome` carries claim references only. It has no field for a number.
- Every figure that reaches the page must come from a claim.
- Never write a hex colour, inline style, or `<script>`. The renderer owns
  presentation entirely.
- Preserve exact product names, metric names and units from the source.
- Cite only sources you actually read.
- If the sources do not support a chapter, say so plainly in your report rather than filling it with prose the evidence does not carry.
- Numerals are traced inside claim cards and the hero, and nowhere else.
- `arc.outcome.headline` is traced **only when it reaches the hero** — which happens when `outcome` references a measured or estimated claim. With no such claim there is no hero, the headline falls back to its own chapter, and nothing checks it.
- Never checked at all: the other chapter headlines and details, evidence titles, the initiative name.
- So put no figure in any headline or in prose. A figure that matters belongs in a `claim`, with a tier and evidence.

## Repair

On failure, change only the diagnosed `subject`, verify `evidence`, and apply
one fix from `supportedFixes` — each names a JSON Pointer into your document.
Make one structural change per round. Continue while the error count reaches a
**new minimum**; if **two consecutive rounds** do not improve the best count,
stop and report the unresolved diagnostics truthfully.

A **non-zero exit** can never be described as success.

### Prohibited repairs

- Downgrading a `measured` claim to `qualitative` is **not a repair for a missing baseline**. Find the number, or state the gap.
- Deleting a claim is **not a repair for a failing driver**.
- **Demoting the primary driver** to escape `driver/primary-no-claim` is not a
  repair.
- Never author an `evidence` entry for a document you **did not read**.
- Removing or rewording a numeral to make **any** diagnostic pass is not a repair. If the figure is real, promote the claim to `measured` or `estimated` and cite evidence; if it is not real, remove the claim and say so. Rewording hides the same unsourced number under different words.

Each of these passes validation by destroying the credibility the artifact
exists to establish.

## Output

Report the artifact path, the validation summary, and the specification and
artifact hashes from the delivery receipt.

`deliver` proves the deterministic artifact checks. It does not prove the
artifact looks right — that is a **human judgment**, and you must not claim it.

<!-- contract:end -->
