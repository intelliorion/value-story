# Copilot Studio version

The same skill, split so it fits a Copilot Studio agent. The full
`../SKILL.md` is 43.6k characters; the Copilot Studio instruction box holds
around 8k. Trimming it would have lost the parts that do the work, so the split
is by ROLE instead:

| | holds | why there |
|---|---|---|
| `01-instructions.md` (6.5k) | posture, the session flow, the absolute rules, the gate | must apply on every turn |
| `knowledge/` | pathway tables, the six questions, measure shapes, form fields, output pages, the value report | looked up when needed |

**The split is not arbitrary.** Knowledge retrieval is chunked and opaque — if
a knowledge chunk does not surface, the agent proceeds without it. So anything
that must ALWAYS hold lives in instructions: never invent a value, a rubric
score is not a business result, no polished output for a weak case, the verdict.
Knowledge is for lookup; instructions are for rules.

## Setting it up

1. **Copilot Studio → Create → New agent.**
2. **Instructions:** paste `01-instructions.md` whole.
3. **Knowledge:** upload the six files in `knowledge/`, or point the agent at a
   SharePoint folder containing them. Keep the filenames — the instructions
   reference them by name.
4. **Starter prompts.** The agent only runs when someone opens it, so give it a
   way in:
   - "I have an idea for my team — is it worth putting to CSIC?"
   - "Which delivery pathway would this need?"
   - "Help me get this ready to submit"
   - "How do I measure whether this worked?"
5. **Publish to Teams**, where CS functions already are.

## Two things that do not transfer

**No file writing.** Copilot Studio cannot produce `submission.html` and
`case.html` as files. Either accept the HTML in a code block for the user to
save, or wire a Power Automate flow: the agent hands over structured fields, the
flow writes to SharePoint or posts into the repository. That is real build work
but it is the version people would actually use.

**No proactive invocation.** In Claude Code the skill fires when someone
describes an initiative. A Studio agent waits to be opened. Starter prompts and
a Teams presence are how you compensate.

## Keeping it in step

`01-instructions.md` and `knowledge/` are derived from `../SKILL.md`. When the
pathway rules, the form or the dropdowns change, change `../SKILL.md` first and
regenerate — otherwise the Claude Code version and the Studio agent will drift,
and nobody will notice until two people get different answers.

And the maintenance question this skill asks everyone else applies here too:
**in eighteen months, when the pathway rules change, who updates these files?**
