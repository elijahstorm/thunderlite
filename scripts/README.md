# ThunderLite Orchestrator

Walks the cards under [`../cards/`](../cards/) one at a time. Each card alternates between a **coder** phase (implements + commits) and a **QA** phase (reviews the commit and categorizes findings). The orchestrator plays manager: it advances when QA passes, or loops back to the coder with QA feedback when there are critical findings.

A 30-minute delay is enforced between every phase so the rhythm is predictable and you can monitor at a relaxed pace.

## Quick start

```bash
# 1. monitor the live log in one terminal
tail -f .orchestrator.log

# 2. start the orchestrator in another terminal (long-running)
node scripts/orchestrator.mjs

# debug mode — skip the 30 min waits
node scripts/orchestrator.mjs --no-delay

# resume after a crash (state is persisted in .orchestrator-state.json)
node scripts/orchestrator.mjs
```

## Flags

| flag           | purpose                                               |
| -------------- | ----------------------------------------------------- |
| `--reset`      | wipe `.orchestrator-state.json` and start from card 1 |
| `--no-delay`   | skip the 30-min phase delays (debug/dev)              |
| `--dry-run`    | don't actually spawn Claude; print what would happen  |
| `--only A1`    | run a single card and exit                            |
| `--skip-to B2` | jump the state pointer to a specific card and resume  |

## State and reports

- `.orchestrator-state.json` — persistent pointer (which card, which iteration). Resumable.
- `.orchestrator.log` — append-only timestamped log of every event.
- `.orchestrator-reports/` — one file per coder/qa run with the full transcript.

## Phase cadence

Each card runs through:

```
CODER (~10-30 min)
  ↓ 30 min wait
QA (~5-15 min)
  ↓ manager decides PASS or NEEDS-FIX
  ↓ 30 min wait
  ↓
ADVANCE → next card                 FIX → loop back to CODER (max 2 fix passes per card)
```

With 25 cards and on average one fix pass per card, expect ~50 hours wall-clock. The orchestrator is resumable; killing it (`Ctrl-C`) and restarting picks up at the next phase.

## How the bots are briefed

Three role prompts live in [`lib/prompts.mjs`](./lib/prompts.mjs):

- **coder**: gets the mission, the card, and is told to commit + report.
- **coder-fix**: gets the same plus the prior QA report; is told to be defensive but fair.
- **qa**: gets the mission, the card, and the commit SHA; is told to be conservative and not flag false positives.

Each Claude is spawned with `--dangerously-skip-permissions` and `--model opus`. The CLI for Claude must be on PATH (override with `CLAUDE_BIN`).

## Manager dispatch

The orchestrator parses the QA output for:

```
VERDICT: PASS | NEEDS-FIX
CRITICAL FINDINGS:
- ...
```

The manager (`managerDecide`) advances to the next card when verdict is PASS **or** the critical-finding count is 0. Otherwise it sends the coder back for a fix pass, up to `MAX_FIX_ITERATIONS = 2`. After that it advances regardless to keep the pipeline moving.
