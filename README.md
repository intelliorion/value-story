# Value Story

A prompt skill that turns the documents about one AI initiative into a
leadership value narrative — with claims that are typed by evidence strength,
and gaps that are named rather than filled in.

**[`SKILL.md`](SKILL.md) is the whole thing.** One file, ~120 lines, no install.

## Use it

| Tool | Where to put it |
|---|---|
| Claude Code, one project | `.claude/skills/value-story/SKILL.md` |
| Claude Code, everywhere | `~/.claude/skills/value-story/SKILL.md` |
| Copilot in VS Code | `.github/copilot-instructions.md` |
| Anything else | paste it into the conversation |

Then: *"build a value story for this initiative from the documents in ./sources"*.

## What it enforces

- **You cannot cite what you did not read.**
- **Every number on the page comes from a claim you can point at** — never from a headline or from prose.
- **Three claim tiers**: `measured` needs a real before and after from a cited source; `estimated` needs the assumption and an owner; `qualitative` carries no figure at all.
- **A rubric score is never a business result.** A prioritisation judgement is not a measurement.
- **Naming a gap is a correct answer.** "No baseline exists, so win rate is not claimed" beats a number nobody can defend.

It covers the four-chapter arc, the ten value drivers, and leadership's five
questions — including the two that always get missed, risk and reach.

## History

Earlier commits carry a full Node implementation of the same contract: a JSON
schema, a validator that refuses a document breaking any rule above, an
evidence manifest that verifies citations against what was actually read, a
deterministic renderer and a browser-based layout gate. It was removed in
favour of the prompt because the prompt does the job. Recover it with
`git checkout a86d79d -- .`
