---
name: value-story
description: Turn an AI initiative's documentation into a validated, self-contained HTML value narrative for leadership. Use when asked to show the business value of a project, build a value case, prepare a roadshow artifact, or map an initiative to value drivers.
metadata:
  version: "0.1"
---

<!-- Assembled by scripts/build-standalone.mjs from SKILL.md, `vs schema` and
     fixtures/example.value-case.json. Regenerate rather than editing by hand. -->

# Value Story — standalone skill

Turn an AI initiative's documentation into a validated value narrative for
leadership. **This single file is the whole skill.** It needs no repository, no
install and no command line: put it somewhere an agent will read it, and the
contract below is in force.

## Install it

Save this file as one of these, then restart the tool:

| Tool | Path |
|---|---|
| Claude Code, one project | `<project>/.claude/skills/value-story/SKILL.md` |
| Claude Code, everywhere | `~/.claude/skills/value-story/SKILL.md` |
| Copilot in VS Code | `<project>/.github/copilot-instructions.md` — drop the `---` block at the top |
| Anything else | paste it into the conversation before you start |

Then ask in plain language: *build a value story for this initiative from the documents in ./sources*.

## What is different without the command line

The full tool ships a validator that **refuses** a document breaking any rule
below, and an evidence manifest that refuses a citation naming a document
nobody read. Neither is here. This file carries the same rules, but as
INSTRUCTIONS rather than as a gate — so the discipline is yours to keep.

Two consequences worth being honest about:

1. **Nothing enforces the rules.** A document that ignores them looks identical
   to one that obeys them.
2. **No citation is verified.** Treat `citationsVerified` as false for anything
   authored this way, and say so when you present it.

Section 5 is the manual check to run in place of the validator.

---

# 1. The contract

Create a self-contained HTML value narrative from a small typed JSON specification.
The audience is leadership. They want business outcomes, not technology.

Run `node bin/vs.mjs help --json` to discover every command and the receipt format.
Every capability is reachable from the command line; nothing depends on a particular agent harness.

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
A manifest row carrying `warnings` was decoded with a caveat, and `validate` reports `evidence/source-warning` when you cite it: a warned source must be verified against the original before its text is quoted.

## Fast authoring path

1. Run `node bin/vs.mjs schema` and read `fixtures/example.value-case.json`. Read only those. Use the fixture for field shape, never for facts. `vs schema` is self-contained: every closed enumeration and every date pattern is in it. Never guess a `driver` — the ten valid values are printed under `$defs.driver.enum`.
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

Name the person or role that owns the estimate in `assumption.owner` — one the source actually names, never an invented plausible-sounding one. A role ("Head of Claims Operations") is a valid owner; "the portfolio norm" is not, because nobody can be asked about it. If nobody will own the estimate, it is not an estimate — make it qualitative.

## Reading a portfolio record

Most source records are early-stage: a rubric score, an assumed rating, an unquantified benefit. A line like *"no reach evidence stated; assumed departmental, the portfolio norm"* is itself evidence — evidence of an ASSUMPTION, not of an outcome. A rubric score is a prioritisation judgement, never a business result, and must never become a `measured` claim. Promoting "efficiency 4" to a measured figure fabricates a business result out of a routing decision.

## Authoring invariants

- One primary driver, from `$defs.driver.enum`. It must have at least one claim behind it.
- `outcome` carries claim references only. It has no field for a number.
- Every figure that reaches the page must come from a claim.
- Never write a hex colour, inline style, or `<script>`. The renderer owns presentation entirely.
- Preserve exact product names, metric names and units from the source.
- Cite only sources you actually read. `evidence[].date` is `YYYY-MM-DD` and records when the DOCUMENT is from, never the precision of anything in it: if the source gives only a month, use the first of that month rather than inventing a day. `meta.period` and every `asof` are `YYYY-MM`.
- If the sources do not support a chapter, say so plainly in your report rather than filling it with prose the evidence does not carry.
- An outcome chapter carrying only `qualitative` claims is a **correct outcome, not a failure**. Say so in the headline. Naming the gap precisely is more useful to leadership than a manufactured number, and the tool rejects the manufactured number anyway.
- Numerals are traced inside claim cards and the hero, and nowhere else.
- `arc.outcome.headline` is traced **only when it reaches the hero** — which happens when `outcome` references a measured or estimated claim. With no such claim there is no hero, the headline falls back to its own chapter, and nothing checks it.
- Never checked at all: the other chapter headlines and details, evidence titles, the initiative name.
- So put no figure in any headline or in prose. A figure that matters belongs in a `claim`, with a tier and evidence.

## Repair

On failure, change only the diagnosed `subject`, verify `evidence`, and apply one fix from `supportedFixes`. For a document-level diagnostic — every `arc/`, `claim/`, `driver/`, `evidence/`, `render/` and `schema/` code — each fix names a JSON Pointer into your document. `layout/*` is the exception and is not yours: see The gate.
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

## The gate — the renderer's, not yours

```bash
node bin/vs.mjs visual-check <out.html> --json
```

`validate` and `deliver` are the AUTHOR's gate on the document. `visual-check` is a MAINTAINER's gate on the rendering: it measures
the DELIVERED artifact in a real browser at three desk sizes — horizontal overflow, WCAG contrast, text collision, and the hero delta above the fold. Scrolling down is never a finding.

A `layout/*` finding names a CSS selector and a file under `src/render/`, which you are forbidden to read or edit. **It is not yours to
repair, and it is never a reason to alter the value case.** A non-zero exit here is still not success — but the honest completion is to report
the findings verbatim as a renderer defect, never to change the document until they stop firing. The bands below address the renderer's maintainer:

- **≤ 40px over** — tighten one gap or padding by 20-40px; do not remove content.
- **41-200px over** — move a supporting element to the next chapter; do not shrink the hero numeral.
- **over 200px** — the layout is wrong for this content: report it rather than compressing it.

Contrast is a token change in `src/render/tokens.mjs` — not a per-element override: the palette is centralised, so an override patches one instance and leaves the defect in place. Both are the maintainer's edits, not the author's.

### Counterfeit passes

**Never: no `overflow:hidden`, no clipped content, no internal scroller, no reduced typography to pass the gate.**
Each makes the measurement pass while making the artifact worse — the visual form of rewording a numeral away.

The findings array is capped per viewport. Read `summary` for what was reported against what was measured: "15 of 36",
never a bare 15 — and `summary.measured`, which says how much of the page could be measured at all.

## Three claims, never merged

`deliver` proves the deterministic artifact checks. It does not prove the artifact looks right — that is a **human judgment**, and you must not claim it.

`visual-check` proves bounded behaviour in a real browser. That is all it proves: whether the artifact is any good remains a **human judgment**, and the tool never claims it.

---

# 2. The schema

The complete, self-contained JSON Schema for a value case. Every closed
enumeration is in it: **never guess a `driver`, a `tier`, a `kind` or a date
format — they are all listed here.**

```json
{
  "$id": "https://value-story.local/value-case.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": [
    "schema_version",
    "meta",
    "initiative",
    "drivers",
    "arc",
    "claims",
    "evidence"
  ],
  "additionalProperties": false,
  "properties": {
    "schema_version": {
      "const": 1
    },
    "meta": {
      "type": "object",
      "required": [
        "title",
        "period"
      ],
      "additionalProperties": false,
      "properties": {
        "title": {
          "type": "string",
          "minLength": 1
        },
        "owner": {
          "type": "string"
        },
        "period": {
          "$ref": "#/$defs/period"
        },
        "quality_profile": {
          "type": "string",
          "enum": [
            "draft",
            "showcase"
          ]
        },
        "motion": {
          "type": "string",
          "enum": [
            "static",
            "entry"
          ]
        }
      }
    },
    "initiative": {
      "type": "object",
      "required": [
        "id",
        "name"
      ],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "sponsor": {
          "type": "string"
        },
        "function": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "poc",
            "pilot",
            "live",
            "retired"
          ]
        }
      }
    },
    "drivers": {
      "type": "object",
      "required": [
        "primary"
      ],
      "additionalProperties": false,
      "properties": {
        "primary": {
          "$ref": "#/$defs/driver"
        },
        "secondary": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/driver"
          },
          "uniqueItems": true
        }
      }
    },
    "arc": {
      "type": "object",
      "required": [
        "problem",
        "capability",
        "outcome",
        "significance"
      ],
      "additionalProperties": false,
      "properties": {
        "problem": {
          "$ref": "#/$defs/prose_chapter"
        },
        "capability": {
          "$ref": "#/$defs/prose_chapter"
        },
        "significance": {
          "$ref": "#/$defs/prose_chapter"
        },
        "outcome": {
          "type": "object",
          "required": [
            "headline",
            "claim_refs"
          ],
          "additionalProperties": false,
          "properties": {
            "headline": {
              "type": "string",
              "minLength": 1
            },
            "claim_refs": {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/$defs/ref"
              }
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
        "required": [
          "id",
          "driver",
          "tier"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "minLength": 1
          },
          "driver": {
            "$ref": "#/$defs/driver"
          },
          "tier": {
            "type": "string",
            "enum": [
              "measured",
              "estimated",
              "qualitative"
            ]
          },
          "metric": {
            "type": "string",
            "minLength": 1
          },
          "unit": {
            "type": "string",
            "minLength": 1
          },
          "direction": {
            "type": "string",
            "enum": [
              "increase",
              "decrease"
            ]
          },
          "baseline": {
            "$ref": "#/$defs/point"
          },
          "current": {
            "$ref": "#/$defs/point"
          },
          "statement": {
            "type": "string",
            "minLength": 1
          },
          "evidence_ref": {
            "$ref": "#/$defs/ref"
          },
          "assumption": {
            "type": "object",
            "required": [
              "statement",
              "owner"
            ],
            "additionalProperties": false,
            "properties": {
              "statement": {
                "type": "string",
                "minLength": 1
              },
              "owner": {
                "type": "string",
                "minLength": 1
              }
            }
          }
        },
        "allOf": [
          {
            "if": {
              "properties": {
                "tier": {
                  "const": "measured"
                }
              },
              "required": [
                "tier"
              ]
            },
            "then": {
              "properties": {
                "metric": {},
                "unit": {},
                "direction": {},
                "baseline": {},
                "current": {}
              },
              "required": [
                "metric",
                "unit",
                "direction",
                "baseline",
                "current"
              ]
            }
          },
          {
            "if": {
              "properties": {
                "tier": {
                  "const": "estimated"
                }
              },
              "required": [
                "tier"
              ]
            },
            "then": {
              "properties": {
                "metric": {},
                "unit": {},
                "direction": {},
                "baseline": {},
                "current": {},
                "assumption": {}
              },
              "required": [
                "metric",
                "unit",
                "direction",
                "baseline",
                "current",
                "assumption"
              ]
            }
          },
          {
            "if": {
              "properties": {
                "tier": {
                  "const": "qualitative"
                }
              },
              "required": [
                "tier"
              ]
            },
            "then": {
              "properties": {
                "statement": {}
              },
              "required": [
                "statement"
              ],
              "not": {
                "anyOf": [
                  {
                    "properties": {
                      "baseline": {}
                    },
                    "required": [
                      "baseline"
                    ]
                  },
                  {
                    "properties": {
                      "current": {}
                    },
                    "required": [
                      "current"
                    ]
                  },
                  {
                    "properties": {
                      "unit": {}
                    },
                    "required": [
                      "unit"
                    ]
                  },
                  {
                    "properties": {
                      "direction": {}
                    },
                    "required": [
                      "direction"
                    ]
                  }
                ]
              }
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
        "required": [
          "ref",
          "kind",
          "title",
          "date"
        ],
        "additionalProperties": false,
        "properties": {
          "ref": {
            "$ref": "#/$defs/ref"
          },
          "kind": {
            "type": "string",
            "enum": [
              "doc",
              "email",
              "dataset",
              "interview"
            ]
          },
          "title": {
            "type": "string",
            "minLength": 1
          },
          "author": {
            "type": "string"
          },
          "date": {
            "$ref": "#/$defs/date"
          },
          "locator": {
            "type": "string"
          },
          "quote": {
            "type": "string"
          }
        }
      }
    }
  },
  "$defs": {
    "driver": {
      "type": "string",
      "enum": [
        "productivity",
        "operational-adaptability",
        "governance-oversight",
        "standardization-knowledge",
        "high-value-skills-ip",
        "differentiation",
        "labor-cost-efficiency",
        "process-cost-efficiency",
        "overhead-cost-efficiency",
        "capex-reduction"
      ]
    },
    "period": {
      "type": "string",
      "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])$"
    },
    "date": {
      "type": "string",
      "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"
    },
    "ref": {
      "type": "string",
      "minLength": 1
    },
    "point": {
      "type": "object",
      "properties": {
        "value": {
          "type": "number"
        },
        "asof": {
          "$ref": "#/$defs/period"
        },
        "evidence_ref": {
          "$ref": "#/$defs/ref"
        }
      },
      "required": [
        "value",
        "asof"
      ],
      "additionalProperties": false
    },
    "prose_chapter": {
      "type": "object",
      "properties": {
        "headline": {
          "type": "string",
          "minLength": 1
        },
        "detail": {
          "type": "string",
          "minLength": 1
        },
        "evidence_refs": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ref"
          }
        },
        "novelty": {
          "type": "string",
          "enum": [
            "first-of-kind",
            "incremental",
            "reusable"
          ]
        }
      },
      "required": [
        "headline"
      ],
      "additionalProperties": false
    }
  }
}
```

---

# 3. A complete worked example

Use it for field SHAPE, never for facts.

```json
{
  "schema_version": 1,
  "meta": { "title": "Intake Triage", "owner": "Head of Legal Operations", "period": "2026-08",
            "quality_profile": "showcase", "motion": "entry" },
  "initiative": { "id": "int-01", "name": "Intake Triage", "sponsor": "Head of Operations",
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
                      "owner": "Finance Business Partner" } },
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

---

# 4. Rendering it

Without the repository there is no deterministic renderer, so the agent writes
the HTML. Three rules keep the output honest and forwardable:

- **Every figure on the page must come from a claim.** A number in a headline
  or in prose is untraceable — move it into a claim, or remove it.
- **Render the tier structurally, not as a label.** A `measured` claim shows a
  before and an after. An `estimated` claim shows the figure with its
  assumption and owner beside it. A `qualitative` claim shows a sentence and no
  figure at all. A reader who never learns the vocabulary should still see that
  the third card is a different kind of thing.
- **One self-contained file.** No CDN, no external font, no script. It has to
  open on a plane and print without losing meaning.

---

# 5. The manual check, in place of the validator

Run this before the artifact goes to anyone. Each line is a rule the real
validator enforces mechanically.

- [ ] All four arc slots present and non-empty: problem, capability, outcome, significance.
- [ ] `outcome` references claims only. No number is written into its text.
- [ ] Exactly one primary driver, from the ten in the schema, and at least one claim carries it.
- [ ] Every `measured` claim has a baseline, a current value, a unit and cited evidence.
- [ ] Every `estimated` claim states its assumption and names the person or role who owns it.
- [ ] No `qualitative` claim contains a numeral anywhere in its statement.
- [ ] Every numeral visible on the finished page traces to a claim. Read the page and check each one.
- [ ] Every cited document was actually read. If you did not open it, delete the citation.
- [ ] No rubric score is tiered `measured`. A score is a prioritisation judgement, never a business result.
- [ ] `direction` matches the movement the numbers actually describe.
- [ ] Each of the five leadership questions is either answered, or reported as unanswered.

If a line fails, repair the document — never the check.

---

# 6. Rebuilding the full tool

If files can ever reach the machine, the tool adds four things this file cannot:
a validator that refuses, an evidence manifest that proves what was read, a
deterministic renderer, and a browser gate measuring contrast, overflow and
collision.

It needs Node 22 or newer and has **no runtime dependencies** — a bare copy of
the repository runs with no `npm install`.

```bash
node bin/vs.mjs ingest ./sources --out ./work --json
node bin/vs.mjs validate ./case.json --manifest ./work/evidence-manifest.json --json
node bin/vs.mjs deliver  ./case.json ./story.html --manifest ./work/evidence-manifest.json --json
node bin/vs.mjs visual-check ./story.html --json
```

Source: https://github.com/intelliorion/value-story
