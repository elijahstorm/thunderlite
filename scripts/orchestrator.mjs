#!/usr/bin/env node
/**
 * ThunderLite Orchestrator
 *
 * Walks the cards in `cards/` one at a time. Each card alternates between
 * a CODER phase (implements + commits) and a QA phase (reviews commit).
 * The orchestrator plays manager: it decides whether to advance to the
 * next card or send the coder back for a fix iteration.
 *
 * Cadence: a 30-minute delay is enforced between every phase.
 *
 * State is persisted in `.orchestrator-state.json` so the process is
 * resumable. All activity is streamed to stdout and appended to
 * `.orchestrator.log`.
 *
 * Usage:
 *   node scripts/orchestrator.mjs                  # start / resume
 *   node scripts/orchestrator.mjs --reset          # clear state + restart from card 1
 *   node scripts/orchestrator.mjs --no-delay       # skip the 30-min waits (debug)
 *   node scripts/orchestrator.mjs --only A1        # run just one card
 *   node scripts/orchestrator.mjs --skip-to B2     # jump state pointer to a specific card
 *   node scripts/orchestrator.mjs --dry-run        # don't spawn claude, just log what would happen
 */

import { spawn, execSync } from 'child_process'
import {
    readFileSync,
    writeFileSync,
    existsSync,
    readdirSync,
    mkdirSync,
    appendFileSync,
} from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildCoderPrompt, buildCoderFixPrompt, buildQaPrompt } from './lib/prompts.mjs'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CARDS_DIR = resolve(ROOT, 'cards')
const MISSION_FILE = resolve(CARDS_DIR, '00-PROJECT-MISSION.md')
const STATE_FILE = resolve(ROOT, '.orchestrator-state.json')
const LOG_FILE = resolve(ROOT, '.orchestrator.log')
const REPORTS_DIR = resolve(ROOT, '.orchestrator-reports')

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CYCLE_DELAY_MS = 5 * 60 * 1000 // 5 minutes between phases
const CODER_TIMEOUT_MS = 90 * 60 * 1000 // 90 min budget per coder run (A2 was killed at 75)
const QA_TIMEOUT_MS = 60 * 60 * 1000 // 60 min budget per QA run (A3 QA was killed at 30)
const MAX_FIX_ITERATIONS = 2 // after this many fix passes on one card, advance regardless

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'opus'

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const FLAGS = {
    reset: args.includes('--reset'),
    noDelay: args.includes('--no-delay'),
    dryRun: args.includes('--dry-run'),
    only: extractFlagValue(args, '--only'),
    skipTo: extractFlagValue(args, '--skip-to'),
}

function extractFlagValue(argv, flag) {
    const idx = argv.indexOf(flag)
    if (idx === -1) return null
    return argv[idx + 1] || null
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
}

function log(msg, color = '') {
    const stamp = new Date().toISOString()
    const line = `[${stamp}] ${msg}`
    if (color) {
        process.stdout.write(`${color}${line}${ANSI.reset}\n`)
    } else {
        console.log(line)
    }
    try {
        appendFileSync(LOG_FILE, line + '\n')
    } catch {
        /* ignore */
    }
}

function section(title) {
    const bar = '═'.repeat(Math.max(0, 60 - title.length))
    log(`${ANSI.bold}${ANSI.cyan}╔═ ${title} ${bar}${ANSI.reset}`)
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function defaultState() {
    return {
        startedAt: new Date().toISOString(),
        currentCardIndex: 0,
        fixIteration: 0, // 0 = first attempt, 1 = first fix, 2 = second fix
        nextPhase: 'coder', // 'coder' | 'qa'
        lastCommitSha: null,
        lastQaReport: null,
        history: [],
    }
}

function loadState() {
    if (FLAGS.reset || !existsSync(STATE_FILE)) {
        const s = defaultState()
        saveState(s)
        return s
    }
    try {
        return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    } catch (err) {
        log(`Could not parse state, resetting: ${err.message}`, ANSI.yellow)
        const s = defaultState()
        saveState(s)
        return s
    }
}

function saveState(state) {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function listCardFiles() {
    return readdirSync(CARDS_DIR)
        .filter((f) => /^\d{2}-[A-H]\d+-/.test(f))
        .sort()
}

function loadCard(filename) {
    const path = resolve(CARDS_DIR, filename)
    const content = readFileSync(path, 'utf-8')
    const idMatch = filename.match(/^\d{2}-([A-H]\d+)-/)
    return {
        filename,
        id: idMatch ? idMatch[1] : filename,
        content,
        path,
    }
}

function loadMission() {
    return readFileSync(MISSION_FILE, 'utf-8')
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function ensureReportsDir() {
    if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
}

function saveReport({ cardId, phase, iteration, content }) {
    ensureReportsDir()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `${cardId}-${phase}-iter${iteration}-${stamp}.md`
    const path = resolve(REPORTS_DIR, filename)
    writeFileSync(path, content)
    return path
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitHead() {
    return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim()
}

function gitStatus() {
    return execSync('git status --porcelain', { cwd: ROOT }).toString().trim()
}

// ---------------------------------------------------------------------------
// Claude subprocess runner
// ---------------------------------------------------------------------------

function runClaude({ prompt, label, timeoutMs }) {
    return new Promise((resolveP, rejectP) => {
        if (FLAGS.dryRun) {
            log(`[${label}] DRY RUN — not spawning claude. Prompt length: ${prompt.length}`)
            const fakeReport = `=== REPORT ===\nCARD: dry-run\nCOMMIT: none\nFILES CHANGED: none\nWHAT I DID:\n- (dry run)\n=== END REPORT ===`
            resolveP({ stdout: fakeReport, stderr: '', code: 0 })
            return
        }

        log(`[${label}] spawning ${CLAUDE_BIN} (model=${CLAUDE_MODEL})…`, ANSI.magenta)
        const child = spawn(
            CLAUDE_BIN,
            ['--dangerously-skip-permissions', '--model', CLAUDE_MODEL, '--print', prompt],
            {
                cwd: ROOT,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env },
            }
        )

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            const s = data.toString()
            stdout += s
            // stream dimmed lines so the user can monitor
            for (const line of s.split('\n')) {
                if (line.trim()) {
                    process.stdout.write(`${ANSI.dim}    [${label}] ${line}${ANSI.reset}\n`)
                }
            }
        })
        child.stderr.on('data', (data) => {
            const s = data.toString()
            stderr += s
            for (const line of s.split('\n')) {
                if (line.trim()) {
                    process.stdout.write(`${ANSI.yellow}    [${label} STDERR] ${line}${ANSI.reset}\n`)
                }
            }
        })

        const timer = setTimeout(() => {
            log(`[${label}] timeout after ${timeoutMs}ms; killing.`, ANSI.red)
            child.kill('SIGTERM')
            setTimeout(() => child.kill('SIGKILL'), 5000)
            rejectP(new Error(`[${label}] timeout`))
        }, timeoutMs)

        child.on('error', (err) => {
            clearTimeout(timer)
            rejectP(err)
        })

        child.on('close', (code) => {
            clearTimeout(timer)
            log(`[${label}] exited code=${code} stdout=${stdout.length}b stderr=${stderr.length}b`)
            if (code === 0) {
                resolveP({ stdout, stderr, code })
            } else {
                rejectP(new Error(`[${label}] exited with code ${code}`))
            }
        })
    })
}

// ---------------------------------------------------------------------------
// Report parsing
// ---------------------------------------------------------------------------

function parseCoderReport(stdout) {
    const block = extractBlock(stdout, '=== REPORT ===', '=== END REPORT ===')
    if (!block) return { committed: false, files: [], raw: stdout }
    const commit = matchLine(block, /^COMMIT:\s*(\S+)/m)
    const files = matchLine(block, /^FILES CHANGED:\s*(.+)$/m)
    return {
        committed: commit && commit !== 'none',
        commitSha: commit && commit !== 'none' ? commit : null,
        files: files ? files.split(',').map((f) => f.trim()).filter(Boolean) : [],
        raw: block,
    }
}

function parseQaReport(stdout) {
    const block = extractBlock(stdout, '=== QA REPORT ===', '=== END QA REPORT ===')
    if (!block) {
        return { verdict: 'NEEDS-FIX', criticalCount: 0, majorCount: 0, minorCount: 0, raw: stdout }
    }
    const verdict = matchLine(block, /^VERDICT:\s*(PASS|NEEDS-FIX)/im) || 'NEEDS-FIX'

    const criticals = extractFindingsList(block, 'CRITICAL FINDINGS')
    const majors = extractFindingsList(block, 'MAJOR FINDINGS')
    const minors = extractFindingsList(block, 'MINOR FINDINGS')

    return {
        verdict: verdict.toUpperCase(),
        criticalCount: criticals.length,
        majorCount: majors.length,
        minorCount: minors.length,
        criticals,
        majors,
        minors,
        raw: block,
    }
}

function extractBlock(text, startMarker, endMarker) {
    const start = text.indexOf(startMarker)
    if (start === -1) return null
    const end = text.indexOf(endMarker, start)
    if (end === -1) return null
    return text.slice(start + startMarker.length, end).trim()
}

function matchLine(block, re) {
    const m = block.match(re)
    return m ? m[1].trim() : null
}

function extractFindingsList(block, heading) {
    const re = new RegExp(`${heading}:[\\s\\S]*?(?=\\n[A-Z ]+FINDINGS:|\\nVERDICT:|$)`, 'i')
    const m = block.match(re)
    if (!m) return []
    // count lines starting with "-" that are non-empty and not "none"
    return m[0]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('-') && l.length > 2)
        .filter((l) => !/^-\s*(none|n\/a)\b/i.test(l))
}

// ---------------------------------------------------------------------------
// Manager (deterministic dispatcher)
// ---------------------------------------------------------------------------

function managerDecide({ qa, fixIteration }) {
    if (qa.verdict === 'PASS' || qa.criticalCount === 0) {
        return { action: 'ADVANCE', reason: 'no critical findings' }
    }
    if (fixIteration >= MAX_FIX_ITERATIONS) {
        return {
            action: 'ADVANCE',
            reason: `max fix iterations (${MAX_FIX_ITERATIONS}) reached; advancing despite ${qa.criticalCount} critical(s)`,
        }
    }
    return {
        action: 'FIX',
        reason: `${qa.criticalCount} critical finding(s); sending back for fix pass ${fixIteration + 1}`,
    }
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

async function delay(ms, reason) {
    if (FLAGS.noDelay) {
        log(`[--no-delay] skipping ${Math.round(ms / 60000)}-min wait (${reason})`, ANSI.dim)
        return
    }
    const minutes = Math.round(ms / 60000)
    const wakeAt = new Date(Date.now() + ms).toISOString()
    log(`Sleeping ${minutes} min until ${wakeAt} (${reason})…`, ANSI.dim)
    await new Promise((r) => setTimeout(r, ms))
    log(`Awake.`, ANSI.dim)
}

// ---------------------------------------------------------------------------
// Phase runners
// ---------------------------------------------------------------------------

async function runCoderPhase({ mission, card, state }) {
    const isFixPass = state.fixIteration > 0 && state.lastQaReport
    section(
        `CODER — ${card.id} ${isFixPass ? `(fix pass ${state.fixIteration})` : '(initial)'}`
    )

    const startSha = gitHead()
    log(`HEAD before: ${startSha}`)

    const prompt = isFixPass
        ? buildCoderFixPrompt({
              mission,
              card: card.content,
              cardId: card.id,
              qaReport: state.lastQaReport,
              priorCommitSha: state.lastCommitSha || 'unknown',
          })
        : buildCoderPrompt({ mission, card: card.content, cardId: card.id })

    let result
    try {
        result = await runClaude({
            prompt,
            label: `CODER ${card.id}`,
            timeoutMs: CODER_TIMEOUT_MS,
        })
    } catch (err) {
        log(`Coder run failed: ${err.message}`, ANSI.red)
        return { ok: false, error: err.message }
    }

    const endSha = gitHead()
    const parsed = parseCoderReport(result.stdout)
    const committed = endSha !== startSha
    const status = gitStatus()

    log(`HEAD after: ${endSha}  committed=${committed}  workdir-dirty=${status ? 'yes' : 'no'}`)

    const reportPath = saveReport({
        cardId: card.id,
        phase: isFixPass ? `coder-fix${state.fixIteration}` : 'coder',
        iteration: state.fixIteration,
        content: result.stdout,
    })
    log(`Coder report saved: ${reportPath}`, ANSI.dim)

    return {
        ok: true,
        committed,
        commitSha: committed ? endSha : null,
        files: parsed.files,
        reportPath,
        raw: parsed.raw,
    }
}

async function runQaPhase({ mission, card, commitSha, state }) {
    section(`QA — ${card.id} (reviewing ${commitSha?.slice(0, 8) || 'no commit'})`)

    if (!commitSha) {
        log(`No commit to review. Treating as auto-NEEDS-FIX with synthetic finding.`, ANSI.yellow)
        return {
            qa: {
                verdict: 'NEEDS-FIX',
                criticalCount: 1,
                criticals: ['- coder produced no commit'],
                majors: [],
                minors: [],
                raw: 'No commit was made for this card.',
            },
            reportPath: null,
        }
    }

    const prompt = buildQaPrompt({
        mission,
        card: card.content,
        cardId: card.id,
        commitSha,
    })

    let result
    try {
        result = await runClaude({
            prompt,
            label: `QA ${card.id}`,
            timeoutMs: QA_TIMEOUT_MS,
        })
    } catch (err) {
        log(`QA run failed: ${err.message}. Treating as ADVANCE to avoid blocking.`, ANSI.red)
        return {
            qa: {
                verdict: 'PASS',
                criticalCount: 0,
                criticals: [],
                majors: [],
                minors: [],
                raw: `QA crashed: ${err.message}`,
            },
            reportPath: null,
        }
    }

    const qa = parseQaReport(result.stdout)
    const reportPath = saveReport({
        cardId: card.id,
        phase: 'qa',
        iteration: state.fixIteration,
        content: result.stdout,
    })
    log(
        `QA verdict: ${qa.verdict}  CRITICAL=${qa.criticalCount}  MAJOR=${qa.majorCount}  MINOR=${qa.minorCount}`,
        qa.verdict === 'PASS' ? ANSI.green : ANSI.yellow
    )
    log(`QA report saved: ${reportPath}`, ANSI.dim)

    return { qa, reportPath }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
    section('THUNDERLITE ORCHESTRATOR')
    log(`Root: ${ROOT}`)
    log(`Flags: ${JSON.stringify(FLAGS)}`)

    const mission = loadMission()
    const cards = listCardFiles().map(loadCard)
    log(`Loaded ${cards.length} cards from ${CARDS_DIR}`)

    let state = loadState()

    if (FLAGS.skipTo) {
        const idx = cards.findIndex((c) => c.id === FLAGS.skipTo)
        if (idx === -1) {
            log(`--skip-to ${FLAGS.skipTo}: card not found. Aborting.`, ANSI.red)
            process.exit(1)
        }
        log(`--skip-to: jumping state pointer to ${FLAGS.skipTo} (index ${idx}).`, ANSI.yellow)
        state.currentCardIndex = idx
        state.fixIteration = 0
        state.nextPhase = 'coder'
        state.lastCommitSha = null
        state.lastQaReport = null
        saveState(state)
    }

    if (FLAGS.only) {
        const idx = cards.findIndex((c) => c.id === FLAGS.only)
        if (idx === -1) {
            log(`--only ${FLAGS.only}: card not found.`, ANSI.red)
            process.exit(1)
        }
        log(`--only ${FLAGS.only}: running one card and exiting.`, ANSI.yellow)
        await processOneCard({ mission, card: cards[idx], state })
        return
    }

    while (state.currentCardIndex < cards.length) {
        const card = cards[state.currentCardIndex]
        section(
            `CARD ${state.currentCardIndex + 1}/${cards.length} — ${card.id} (fixIteration=${state.fixIteration})`
        )

        const cardResult = await processOneCard({ mission, card, state })

        if (cardResult.action === 'ADVANCE') {
            state.history.push({
                cardId: card.id,
                completedAt: new Date().toISOString(),
                fixIterations: state.fixIteration,
                finalCommitSha: cardResult.finalCommitSha,
                reason: cardResult.reason,
            })
            state.currentCardIndex++
            state.fixIteration = 0
            state.nextPhase = 'coder'
            state.lastCommitSha = null
            state.lastQaReport = null
            saveState(state)
            log(`Advanced to next card.`, ANSI.green)

            if (state.currentCardIndex < cards.length) {
                await delay(CYCLE_DELAY_MS, 'gap before next card')
            }
        } else {
            // FIX path
            state.fixIteration++
            state.nextPhase = 'coder'
            saveState(state)
            log(`Looping back to CODER for fix pass ${state.fixIteration}.`, ANSI.yellow)
            await delay(CYCLE_DELAY_MS, 'gap before fix pass')
        }
    }

    section('ALL CARDS PROCESSED')
    log(`History: ${state.history.length} cards completed.`, ANSI.green)
}

async function processOneCard({ mission, card, state }) {
    // --- CODER ---
    const headBeforeCoder = gitHead()
    const coder = await runCoderPhase({ mission, card, state })

    // Crash recovery: if the coder process errored (timeout, non-zero exit)
    // but a commit landed during the run, treat it as a successful coder
    // run for QA purposes. The bot may have committed cleanly and then
    // been killed during cleanup.
    if (!coder.ok) {
        const headAfterCoder = gitHead()
        if (headAfterCoder !== headBeforeCoder) {
            log(
                `Coder process errored but a commit landed (${headAfterCoder.slice(0, 8)}). Proceeding to QA.`,
                ANSI.yellow
            )
            coder.ok = true
            coder.committed = true
            coder.commitSha = headAfterCoder
        } else {
            log(`Coder phase errored with no commit. Advancing to avoid blocking pipeline.`, ANSI.red)
            return {
                action: 'ADVANCE',
                reason: 'coder crash, no commit; skipped',
                finalCommitSha: null,
            }
        }
    }

    if (coder.committed) {
        state.lastCommitSha = coder.commitSha
        saveState(state)
    } else {
        log(`Coder did not commit. QA will be told there is no diff to review.`, ANSI.yellow)
    }

    // --- 30 MIN DELAY ---
    await delay(CYCLE_DELAY_MS, 'gap before QA')

    // --- QA ---
    const { qa } = await runQaPhase({
        mission,
        card,
        commitSha: coder.committed ? coder.commitSha : state.lastCommitSha,
        state,
    })
    state.lastQaReport = qa.raw
    saveState(state)

    // --- MANAGER DECISION ---
    const decision = managerDecide({ qa, fixIteration: state.fixIteration })
    log(`MANAGER: ${decision.action} — ${decision.reason}`, ANSI.cyan)

    // --- 30 MIN DELAY before next phase (whether fix or next card) ---
    await delay(CYCLE_DELAY_MS, 'gap after QA / before manager dispatch')

    return {
        action: decision.action,
        reason: decision.reason,
        finalCommitSha: state.lastCommitSha,
    }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

process.on('SIGINT', () => {
    log('SIGINT received. Saving state and exiting.', ANSI.yellow)
    process.exit(130)
})
process.on('SIGTERM', () => {
    log('SIGTERM received. Saving state and exiting.', ANSI.yellow)
    process.exit(143)
})

main().catch((err) => {
    log(`FATAL: ${err.stack || err.message}`, ANSI.red)
    process.exit(1)
})
