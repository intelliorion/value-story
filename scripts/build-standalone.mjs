// Assembles docs/standalone-skill.md: ONE self-contained file that is the whole
// skill, for a machine that cannot clone a repository but can paste text.
// Generated rather than written, so the contract, the schema and the worked
// example can never drift from the ones the tool actually enforces.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const skill = read('SKILL.md');
const START = '<!-- contract:start -->';
const END = '<!-- contract:end -->';
const contract = skill.slice(skill.indexOf(START) + START.length, skill.indexOf(END)).trim();
const frontmatter = skill.slice(0, skill.indexOf('---', 3) + 3).trim();
if (!contract || !frontmatter.startsWith('---')) {
  process.stderr.write('SKILL.md is missing its frontmatter or contract delimiters\n');
  process.exit(1);
}
const schema = execFileSync('node', [join(root, 'bin', 'vs.mjs'), 'schema']).toString().trim();
const example = read('fixtures/example.value-case.json').trim();

const CHECKLIST = [
  'All four arc slots present and non-empty: problem, capability, outcome, significance.',
  '`outcome` references claims only. No number is written into its text.',
  'Exactly one primary driver, from the ten in the schema, and at least one claim carries it.',
  'Every `measured` claim has a baseline, a current value, a unit and cited evidence.',
  'Every `estimated` claim states its assumption and names the person or role who owns it.',
  'No `qualitative` claim contains a numeral anywhere in its statement.',
  'Every numeral visible on the finished page traces to a claim. Read the page and check each one.',
  'Every cited document was actually read. If you did not open it, delete the citation.',
  'No rubric score is tiered `measured`. A score is a prioritisation judgement, never a business result.',
  '`direction` matches the movement the numbers actually describe.',
  'Each of the five leadership questions is either answered, or reported as unanswered.',
].map((line) => `- [ ] ${line}`).join('\n');

const doc = `${frontmatter}

<!-- Assembled by scripts/build-standalone.mjs from SKILL.md, \`vs schema\` and
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
| Claude Code, one project | \`<project>/.claude/skills/value-story/SKILL.md\` |
| Claude Code, everywhere | \`~/.claude/skills/value-story/SKILL.md\` |
| Copilot in VS Code | \`<project>/.github/copilot-instructions.md\` — drop the \`---\` block at the top |
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
2. **No citation is verified.** Treat \`citationsVerified\` as false for anything
   authored this way, and say so when you present it.

Section 5 is the manual check to run in place of the validator.

---

# 1. The contract

${contract}

---

# 2. The schema

The complete, self-contained JSON Schema for a value case. Every closed
enumeration is in it: **never guess a \`driver\`, a \`tier\`, a \`kind\` or a date
format — they are all listed here.**

\`\`\`json
${schema}
\`\`\`

---

# 3. A complete worked example

Use it for field SHAPE, never for facts.

\`\`\`json
${example}
\`\`\`

---

# 4. Rendering it

Without the repository there is no deterministic renderer, so the agent writes
the HTML. Three rules keep the output honest and forwardable:

- **Every figure on the page must come from a claim.** A number in a headline
  or in prose is untraceable — move it into a claim, or remove it.
- **Render the tier structurally, not as a label.** A \`measured\` claim shows a
  before and an after. An \`estimated\` claim shows the figure with its
  assumption and owner beside it. A \`qualitative\` claim shows a sentence and no
  figure at all. A reader who never learns the vocabulary should still see that
  the third card is a different kind of thing.
- **One self-contained file.** No CDN, no external font, no script. It has to
  open on a plane and print without losing meaning.

---

# 5. The manual check, in place of the validator

Run this before the artifact goes to anyone. Each line is a rule the real
validator enforces mechanically.

${CHECKLIST}

If a line fails, repair the document — never the check.

---

# 6. Rebuilding the full tool

If files can ever reach the machine, the tool adds four things this file cannot:
a validator that refuses, an evidence manifest that proves what was read, a
deterministic renderer, and a browser gate measuring contrast, overflow and
collision.

It needs Node 22 or newer and has **no runtime dependencies** — a bare copy of
the repository runs with no \`npm install\`.

\`\`\`bash
node bin/vs.mjs ingest ./sources --out ./work --json
node bin/vs.mjs validate ./case.json --manifest ./work/evidence-manifest.json --json
node bin/vs.mjs deliver  ./case.json ./story.html --manifest ./work/evidence-manifest.json --json
node bin/vs.mjs visual-check ./story.html --json
\`\`\`

Source: https://github.com/intelliorion/value-story
`;

writeFileSync(join(root, 'docs', 'standalone-skill.md'), doc);
process.stdout.write(`docs/standalone-skill.md — ${doc.length} bytes, ${doc.split('\n').length} lines\n`);
