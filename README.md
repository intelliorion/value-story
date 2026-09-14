# Value Story

Turn an AI initiative's documentation into a validated, self-contained HTML
value narrative for leadership.

## Requirements

Node 22 or newer. No runtime dependencies — nothing to install to run it.

## Use it from the command line

```bash
node bin/vs.mjs help --json
node bin/vs.mjs schema
node bin/vs.mjs validate my-case.json --json
node bin/vs.mjs deliver  my-case.json out.html --json
open out.html
```

Every capability is reachable this way, so the tool works from any agent, any
editor, or a bare terminal.

## Use it from Claude Code

Copy or symlink this directory into your skills folder:

```bash
# this project only
mkdir -p .claude/skills && ln -s "$PWD" .claude/skills/value-story

# or everywhere
ln -s "$PWD" ~/.claude/skills/value-story
```

Claude Code reads `SKILL.md` and invokes the CLI. Ask for a value narrative and
it will author, validate and deliver the artifact.

## Use it from GitHub Copilot

Two entry points, both generated from the same `SKILL.md`:

- **`.github/copilot-instructions.md`** — the reliable path. VS Code applies
  this automatically to every Copilot request made in this workspace. Nothing
  to enable.
- **`.github/prompts/value-story.prompt.md`** — a convenience, not a
  guarantee. Type `/value-story` in Copilot Chat (agent mode) to run the full
  workflow. This is a VS Code-specific convention and, depending on your VS
  Code version, may require enabling prompt files in settings before the
  slash command appears. If it does not show up, use the instructions file
  above — it works with no setup.

To use it from a different repository, copy `.github/copilot-instructions.md`
there and keep this project on disk so the CLI stays reachable.

## Use it from any other agent

Point the agent at `SKILL.md` and tell it to run `node bin/vs.mjs help --json`
(equivalently, `vs help --json` if installed as a CLI). The help output
describes every command and the repair-receipt format, so no agent needs to
read source to use the tool.

## Keeping the adapters in sync

`SKILL.md` is the single source of truth. After editing it:

```bash
npm run build:adapters
```

`test/adapters.test.mjs` fails if the generated files are stale.

## Third-party notices

This project has no runtime dependencies. `generated/validate-value-case.mjs`
inlines a small amount of MIT-licensed code from Ajv's runtime helpers,
generated at build time; see `THIRD_PARTY_NOTICES.md` for the attribution.
