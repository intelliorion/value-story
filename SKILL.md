---
name: value-story
description: Turn project documents into a leadership value narrative with typed, evidence-backed claims. Use when asked to show the business value of an AI initiative, build a value case, or prepare a roadshow artifact.
---

# Value Story

Turn the documents about one initiative into a single self-contained HTML page
for leadership. They want business outcomes, not technology.

**The rule everything rests on: you cannot cite what you did not read, and
every number on the page must come from a claim you can point at.**

## Step 1 — read the sources, and note what you read

List each document you actually opened. If you did not open it, you may not
cite it. A document you could not read is not evidence of anything.

## Step 2 — write the claim table BEFORE any prose

This is the part that matters. Enumerate every claim first, in a table, so the
numbers exist as data before they exist as sentences:

| id | tier | metric | before | after | unit | driver | source |
|---|---|---|---|---|---|---|---|

Give each claim a tier, and choose the tier the source supports — never the
tier you wish it supported.

| tier | when | requires |
|---|---|---|
| **measured** | a real before and after exist in a cited source | both figures, a unit, and the document they came from |
| **estimated** | a number is inferred or asserted, not measured | the assumption stated, and a person or role who owns it |
| **qualitative** | something changed with no number | a sentence, and **no figure at all** |

**The test: could someone re-run the query and get the same number?** If yes,
`measured`. If no, `estimated`.

A figure stated in a deck, a status update or an email with nothing behind it
is **estimated**, not measured — and it needs a named owner. A role ("Head of
Claims Operations") is a valid owner. "The portfolio norm" is not, because
nobody can be asked about it. If nobody will own it, it is not an estimate:
make it qualitative.

**A rubric score is never a business result.** Portfolio records carry things
like `effectiveness 4`, `efficiency 2`. Those are prioritisation judgements
about what to build next. Promoting one to a measured figure manufactures a
business result out of a routing decision. A line like *"no reach evidence
stated; assumed departmental, the portfolio norm"* is evidence of an
ASSUMPTION, not of an outcome.

## Step 3 — map each claim to one value driver

**Effectiveness** — `productivity` Productivity  ·  `operational-adaptability` Operational Adaptability  ·  `governance-oversight` Governance & Oversight  ·  `standardization-knowledge` Standardization & Knowledge  ·  `high-value-skills-ip` High-Value Skills & IP  ·  `differentiation` Differentiation

**Efficiency** — `labor-cost-efficiency` Labor Cost Efficiency  ·  `process-cost-efficiency` Process Cost Efficiency  ·  `overhead-cost-efficiency` Overhead Cost Efficiency  ·  `capex-reduction` CapEx Reduction

Pick one primary driver for the initiative. It must have at least one claim
behind it.

## Step 4 — write the four chapters

Always these four, in this order:

1. **What problem existed?**
2. **What capability did AI unlock?**
3. **What outcome changed?** — this chapter carries the claims from your table
4. **Why does it matter to the firm?**

**Chapters 1, 2 and 4 are prose and contain no figures.** A number in prose is
a number nobody can trace. Every figure belongs in a claim.

## Step 5 — answer leadership's five questions explicitly

State each one, and say plainly when the evidence does not answer it.

1. How much more productivity did we get?
2. How much risk did we reduce? — control exceptions, error rates, audit findings
3. What new capabilities do we now have?
4. How much cost did we avoid?
5. How many employees and functions were enabled?

**Risk and reach are the two that get missed.** Cost and time figures sit on
the surface of a status report; control-exception counts and headcount reach do
not. Hunt for those two specifically.

**Naming a gap is a correct answer.** "No baseline exists, so win rate is not
claimed" is more useful to leadership than a number you made up, and it is the
finding they need. Never quietly answer three and present it as five.

## Step 6 — produce the page

One self-contained HTML file. No CDN, no external font, no script — it has to
open offline and print without losing meaning.

Render the tier **structurally, not as a label**: a measured claim shows a
before and an after; an estimated claim shows the figure with its assumption
and owner beside it; a qualitative claim shows a sentence and no figure. A
reader who never learns the vocabulary should still see that the third card is
a different kind of thing.

## Before you hand it over

- [ ] Every figure on the page traces to a claim in your table. Read the page and check each one.
- [ ] No figure appears in a headline or in prose.
- [ ] No qualitative claim contains a numeral.
- [ ] Every measured claim has a before, an after, a unit and a named source.
- [ ] Every estimated claim names who owns the assumption.
- [ ] No rubric score is tiered measured.
- [ ] Every cited document was actually opened.
- [ ] Each of the five questions is answered, or reported as unanswered.

## Things that are not repairs

- Downgrading a measured claim to qualitative because you cannot find the baseline. Find the number, or state the gap.
- Deleting a claim to make a driver pass.
- Rewording a number to make a problem go away — that hides the same unsourced figure under different words.
- Citing a document you did not read.

Each of these passes inspection by destroying the credibility the artifact
exists to establish.
