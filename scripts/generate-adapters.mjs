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

process.stdout.write('.github/copilot-instructions.md\n.github/prompts/value-story.prompt.md\n');
