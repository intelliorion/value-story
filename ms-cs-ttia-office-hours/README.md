# MS Corporate Services — TTIA Office Hours

For **TTIA (Technology Transformation, Information & Analytics)** inside Morgan
Stanley Corporate Services — the team that scores the portfolio, routes items
and prepares them for CSIC review.

The stance is the one on the record: **USER-LED, TTIA ADVISED.** The function
owns the initiative; TTIA advises, scores and routes. The skill is written to
advise hard and decide nothing — and never to fill a field on the function's
behalf, because a guessed value becomes a portfolio fact nobody remembers
guessing.

A diagnostic skill for initiatives inside a cost-centre function that serves
internal clients. One markdown file, no install, no code.

Adapted from the structure of a YC-style product diagnostic, with the questions
rebuilt — a venture diagnostic rests on "will a stranger pay", which has no
meaning in a function where nobody pays.

## Install

```
~/.claude/skills/ms-cs-ttia-office-hours/SKILL.md      # available everywhere
.claude/skills/ms-cs-ttia-office-hours/SKILL.md        # one project
.github/copilot-instructions.md                # Copilot, minus the --- block
```

Then: *"office hours on this"*, or just describe the initiative.

## The six questions

1. Who asked for this, by name?
2. What does the status quo cost today — and is anyone recording it?
3. Who signs, and what is their bar?
4. What is the smallest version that clears a control review?
5. What breaks if it fails, and who is accountable?
6. Does it survive a budget cycle and a reorg?

It routes by stage rather than asking all six. **Q2 is asked every time** — it
is the only one that gets harder to answer with time.

## It fills the intake form

Phase 5 emits the record in the intake form's own field names — Context,
Classification, the five-card story, controls, risk and sustainability — and
ends with a submission-readiness check naming every required field still
UNKNOWN. It never invents a value: a form filled with plausible guesses is
worse than one with honest gaps, because the guesses survive into the portfolio
and nobody remembers they were guesses.

Two blanks it always calls out, whether or not the form demands them:
**TECH OWNER / SQUAD** (an approved item with no accountable team gets carried
over, not built) and **BASELINE OWNER** (the benefit will one day be claimed
against a number nobody captured).

## Pairs with value-story

`ms-cs-ttia-office-hours` runs at intake and forces the baseline to be captured.
`value-story` runs at outcome and refuses to overstate what was achieved.

The gap between them is where most portfolio initiatives lose their evidence:
the benefit is claimed months later against a baseline nobody recorded.
