import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Inputs are always read from the repository; only the DESTINATION is
// overridable, so a drift test can regenerate into a scratch directory and
// compare without mutating the working tree.
const outRoot = process.env.VS_OUTPUT_ROOT || root;
const skill = readFileSync(join(root, 'SKILL.md'), 'utf8');

const START = '<!-- contract:start -->';
const END = '<!-- contract:end -->';
const body = skill.slice(skill.indexOf(START) + START.length, skill.indexOf(END)).trim();

if (!body) {
  process.stderr.write('SKILL.md is missing its contract delimiters\n');
  process.exit(1);
}

const BANNER = '<!-- Generated from SKILL.md by scripts/generate-adapters.mjs. Do not edit. -->';

// SKILL.md sits at the repository root so a human opening the repo finds the
// contract first. Claude Code only DISCOVERS a skill under `.claude/skills/`,
// so the root file alone gives no `/value-story` command. The frontmatter is
// carried through verbatim rather than restated: two copies of a name and
// description drift, and the description is what decides whether the skill is
// offered at all.
const frontmatter = skill.slice(0, skill.indexOf('---', 3) + 3).trim();
if (!frontmatter.startsWith('---')) {
  process.stderr.write('SKILL.md is missing its frontmatter\n');
  process.exit(1);
}

mkdirSync(join(outRoot, '.github', 'prompts'), { recursive: true });

writeFileSync(join(outRoot, '.github', 'copilot-instructions.md'),
`${BANNER}

# Value Story

These instructions apply when working on value narratives in this repository.
The CLI is also reachable as \`vs help --json\` if this package's \`bin\` entry
is on your PATH.

${body}
`);

writeFileSync(join(outRoot, '.github', 'prompts', 'value-story.prompt.md'),
`---
mode: agent
description: Build a validated HTML value narrative for an AI initiative.
---
${BANNER}

Build a value narrative for the initiative I name. Follow this contract exactly.

${body}
`);

mkdirSync(join(outRoot, '.claude', 'skills', 'value-story'), { recursive: true });

writeFileSync(join(outRoot, '.claude', 'skills', 'value-story', 'SKILL.md'),
`${frontmatter}
${BANNER}

# Value Story

${body}
`);

process.stdout.write('.github/copilot-instructions.md\n.github/prompts/value-story.prompt.md\n.claude/skills/value-story/SKILL.md\n');
