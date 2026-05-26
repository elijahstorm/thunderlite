/**
 * Prompt builders for the orchestrator.
 *
 * Three roles:
 *   - coder:    implement a card, commit changes, report what was done.
 *   - qa:       review the last commit against the card's acceptance criteria.
 *   - coder-fix: revisit a card with QA feedback; defend or accept each finding.
 *
 * All prompts pass the project mission and the card body so a fresh Claude
 * instance has full context.
 */

const COMMON_PREAMBLE = `You are working autonomously inside a SvelteKit project. You have a normal Claude Code environment with file editing, bash, and git available. You MUST stay inside the project working directory. Do NOT push to remote. Do NOT modify CI config unless the card explicitly says so. Do NOT add new top-level dependencies without justification.

When you commit, the message subject MUST start with the card id in square brackets (e.g. "[A1] ..."). Use a HEREDOC body describing what changed.

## EFFICIENCY RULES (READ CAREFULLY — recent runs wasted 60+ minutes each by ignoring these)

1. Land the minimum viable solution. Acceptance criteria are the bar, not a starting point.
2. Implement → run targeted tests once → commit → emit the REPORT block → STOP. Do not iterate further "to be sure" or to polish.
3. Do NOT run the full test suite multiple times. Run vitest on YOUR new test files only.
4. Do NOT keep editing after you commit. The commit IS the deliverable.
5. Once you emit the REPORT block below, you are done. No further tool calls. End the session.

## REPORT BLOCK (mandatory — emit exactly once, immediately after committing)

\`\`\`
=== REPORT ===
CARD: <card id>
COMMIT: <git sha of your final commit, or "none">
FILES CHANGED: <comma-separated list of paths, or "none">
WHAT I DID:
- <bullet>
- <bullet>
SKIPPED OR DEFERRED:
- <bullet, or "nothing">
NOTES FOR REVIEWER:
- <bullet, or "nothing">
=== END REPORT ===
\`\`\`

After \`=== END REPORT ===\` you MUST stop. Do not write further prose. Do not call further tools.
`

export function buildCoderPrompt({ mission, card, cardId }) {
	return `# ROLE: Implementation Engineer

${COMMON_PREAMBLE}

## PROJECT MISSION
${mission}

## YOUR CARD (${cardId})

${card}

## RULES OF ENGAGEMENT
- Modern, clean, testable code. Decoupled UI from game logic. Keep modules small.
- Reuse the existing data tables (\`src/lib/GameData/\`) and engine primitives (\`src/lib/Engine/\`).
- Do not break existing tests. Add unit tests for new pure logic.
- If a card depends on prior cards that aren't fully done, stub minimal versions so this card's acceptance criteria can be met, and call that out in SKIPPED OR DEFERRED.
- Commit your work before producing the REPORT block. Use git add for specific files; do not use \`git add -A\` without scoping.
- Functional UI is fine. Don't spend time on prettiness or animations.

## BEGIN
Implement card ${cardId} now.
`
}

export function buildCoderFixPrompt({ mission, card, cardId, qaReport, priorCommitSha }) {
	return `# ROLE: Implementation Engineer (FIX PASS)

${COMMON_PREAMBLE}

## PROJECT MISSION
${mission}

## YOUR CARD (${cardId})

${card}

## PRIOR WORK
You (a previous instance of yourself) implemented this card in commit \`${priorCommitSha}\`. QA has now reviewed that commit and produced findings. Your job is to address valid findings.

## QA REPORT
${qaReport}

## RULES OF ENGAGEMENT
- Be defensive of your prior work but NOT personal. The goal is a great codebase, not winning an argument.
- For each finding:
  - If valid → fix it.
  - If a false positive (QA being overly eager) → leave the code alone and explain in NOTES FOR REVIEWER with code references showing why the original is correct.
- Address ALL CRITICAL findings (or justify in NOTES). Address MAJOR if reasonable. MINOR is optional.
- Commit your fixes as a new commit. Subject line: "[${cardId}] fix: <short summary>".

## BEGIN
`
}

export function buildQaPrompt({ mission, card, cardId, commitSha }) {
	return `# ROLE: Quality Assurance Reviewer

You are reviewing one commit against one card's acceptance criteria. You DO NOT write code. You DO NOT commit anything. Your only deliverable is a structured findings report.

## PROJECT MISSION
${mission}

## THE CARD (${cardId})

${card}

## THE COMMIT TO REVIEW
${commitSha}

## YOUR JOB
1. Run \`git show ${commitSha}\` to see what changed.
2. Read the touched files in full context (not just the diff hunks).
3. For each acceptance-criterion checkbox in the card, decide: met, partial, or missing.
4. Categorize findings:
   - **CRITICAL**: an acceptance criterion is missing or broken. The card cannot ship.
   - **MAJOR**: significant gap or correctness issue that should be fixed.
   - **MINOR**: nit, polish, or improvement that's optional.
5. Be HONEST and CONSERVATIVE. The coder will push back on false positives. Don't demand things outside the card's scope. Don't make stylistic preferences sound critical.
6. If the coder skipped work but DOCUMENTED IT in their REPORT's SKIPPED OR DEFERRED, evaluate whether the skip was reasonable; if so, do not flag it.

## EFFICIENCY RULES (CRITICAL — recent QA runs took 60 min producing zero bytes)

1. Use a single \`git show\` and at most 3-4 targeted file reads. Do NOT read the entire repo.
2. Spend at most ~10 minutes total. Brief is better than thorough.
3. Emit the QA REPORT block below as soon as you have enough evidence. Do NOT keep researching.
4. Once you emit \`=== END QA REPORT ===\` you MUST stop. No further tool calls. End the session.

## OUTPUT FORMAT (mandatory — emit exactly once)

\`\`\`
=== QA REPORT ===
CARD: ${cardId}
COMMIT: ${commitSha}

SUMMARY: <one-sentence verdict>

ACCEPTANCE CRITERIA REVIEW:
- <criterion 1>: <met | partial | missing> — <evidence file:line>
- <criterion 2>: ...

CRITICAL FINDINGS:
- [if any] <finding> — <evidence>

MAJOR FINDINGS:
- [if any] <finding> — <evidence>

MINOR FINDINGS:
- [if any] <finding> — <evidence>

VERDICT: PASS | NEEDS-FIX
=== END QA REPORT ===
\`\`\`

Output ONLY this block. No prose around it. Stop immediately after \`=== END QA REPORT ===\`.
`
}
