import { get, type Readable } from 'svelte/store'
import { gameState, type GameState, type GamePhase } from '$lib/Engine/gameState'
import { audioEngine, type PlaySingleOptions } from '$lib/Audio/audioEngine'

/**
 * Music director — keeps the looping `music` channel in sync with the game
 * phase. The original Battalion: Arena swapped tracks by phase: an intro on
 * load, one theme on your turn, another on the opponent's, a "thinking" loop
 * while the AI computes, a hurry warning on inactivity, and one-shot win/lose
 * stings.
 *
 * The decision is a pure function (`musicForState`) so every phase branch is
 * unit-testable without real audio. The side-effecting `MusicDirector` is a
 * thin shell that derives the phase flags from the game store and calls
 * `playMusic` only when the chosen track actually changes — so rapid turn
 * transitions never stack two tracks.
 */

/** Logical music track ids understood by the audio manifest (`game/*`). */
export type MusicTrackId =
	| 'game/intro'
	| 'game/player'
	| 'game/enemy'
	| 'game/ally'
	| 'game/thinking'
	| 'game/inactive'
	| 'game/win'
	| 'game/lose'

/** One-shot stings that must NOT loop. Everything else loops. */
const NON_LOOPING: ReadonlySet<MusicTrackId> = new Set<MusicTrackId>(['game/win', 'game/lose'])

/**
 * The minimal slice of state the track mapping needs, decoupled from the
 * concrete game store so it can be exercised in isolation.
 */
export interface MusicState {
	phase: GamePhase
	currentTeam: number
	/** Winning team once the match is over (undefined on a draw). */
	winner?: number
	/** Teams allied with the local player (non-local). Relevant when teams > 2. */
	allies?: readonly number[]
	/** The intro sting is still playing before settling into the turn theme. */
	intro?: boolean
	/** The active (opponent) CPU is still computing its move. */
	cpuThinking?: boolean
	/** The inactivity / hurry timer has fired. Gated until H2 wires a timer. */
	inactive?: boolean
}

/**
 * Pure phase → track mapping. No side effects.
 *
 * Precedence, highest first:
 *  1. terminal win / lose sting (match over)
 *  2. intro sting (game just started)
 *  3. inactivity / hurry warning (overrides the local turn theme)
 *  4. local player's own turn theme
 *  5. CPU "thinking" while an opponent computes its move
 *  6. ally / enemy turn theme
 */
export function musicForState(state: MusicState, localTeam: number): MusicTrackId | null {
	if (state.phase === 'gameOver') {
		return state.winner === localTeam ? 'game/win' : 'game/lose'
	}

	// Match in progress from here on.
	if (state.intro) return 'game/intro'
	if (state.inactive) return 'game/inactive'

	if (state.currentTeam === localTeam) return 'game/player'

	// An opponent is active.
	if (state.cpuThinking) return 'game/thinking'
	if (state.allies?.includes(state.currentTeam)) return 'game/ally'
	return 'game/enemy'
}

type TimerHandle = ReturnType<typeof setTimeout>

export interface MusicDirectorOptions {
	/** The local human player's team. Defaults to `0`. */
	localTeam?: number
	/** Teams allied with the local player (for >2 team matches). */
	allies?: readonly number[]
	/**
	 * Whether a team is CPU-controlled — drives the "thinking" theme. Defaults
	 * to never (hot-seat: every opponent is human, so no thinking loop).
	 */
	isCpuTeam?: (team: number) => boolean
	/** Game state source. Defaults to the shared `gameState` store. */
	store?: Readable<GameState>
	/** Looping music playback. Defaults to the shared audio engine. */
	playMusic?: (track: MusicTrackId, opts?: PlaySingleOptions) => void
	/** Stop music. Defaults to the shared audio engine. */
	stopMusic?: () => void
	/** Intro sting duration before settling into the turn theme (ms). */
	introMs?: number
	/** Injectable timer (testing). Defaults to `setTimeout`. */
	setTimer?: (fn: () => void, ms: number) => TimerHandle
	/** Injectable timer clear (testing). Defaults to `clearTimeout`. */
	clearTimer?: (handle: TimerHandle) => void
}

const DEFAULT_INTRO_MS = 3500

/**
 * Subscribes to the game store and drives the `music` channel. Construct one,
 * call `start()`, and `stop()` on teardown. All dependencies are injectable so
 * the director can run headless under vitest.
 */
export class MusicDirector {
	private readonly localTeam: number
	private readonly allies: readonly number[]
	private readonly isCpuTeam: (team: number) => boolean
	private readonly store: Readable<GameState>
	private readonly playMusic: (track: MusicTrackId, opts?: PlaySingleOptions) => void
	private readonly stopMusic: () => void
	private readonly introMs: number
	private readonly setTimer: (fn: () => void, ms: number) => TimerHandle
	private readonly clearTimer: (handle: TimerHandle) => void

	private unsubscribe: (() => void) | null = null
	private introTimer: TimerHandle | null = null
	private intro = false
	private inactive = false
	private current: MusicTrackId | null = null

	constructor(opts: MusicDirectorOptions = {}) {
		this.localTeam = opts.localTeam ?? 0
		this.allies = opts.allies ?? []
		this.isCpuTeam = opts.isCpuTeam ?? (() => false)
		this.store = opts.store ?? gameState
		this.playMusic = opts.playMusic ?? ((track, o) => audioEngine.playMusic(track, o))
		this.stopMusic = opts.stopMusic ?? (() => audioEngine.stopMusic())
		this.introMs = opts.introMs ?? DEFAULT_INTRO_MS
		this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
		this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h))
	}

	/** Begin driving music. Plays the intro sting at the start of a fresh match. */
	start(): void {
		if (this.unsubscribe) return

		const initial = get(this.store)
		if (initial.phase === 'playing' && initial.turnNumber === 1) {
			this.intro = true
			this.introTimer = this.setTimer(() => {
				this.intro = false
				this.introTimer = null
				this.sync()
			}, this.introMs)
		}

		// `subscribe` fires immediately with the current value, seeding `sync`.
		this.unsubscribe = this.store.subscribe(() => this.sync())
	}

	/** Stop driving music and release the subscription / timer. */
	stop(): void {
		if (this.introTimer !== null) {
			this.clearTimer(this.introTimer)
			this.introTimer = null
		}
		if (this.unsubscribe) {
			this.unsubscribe()
			this.unsubscribe = null
		}
		this.intro = false
		this.inactive = false
		this.current = null
		this.stopMusic()
	}

	/**
	 * Set the inactivity / hurry-warning flag. Wired from the H-series inactivity
	 * timer once it exists (see H2); a no-op effect on music until then.
	 * TODO(H2): drive this from the move-relay inactivity timeout.
	 */
	setInactive(inactive: boolean): void {
		if (this.inactive === inactive) return
		this.inactive = inactive
		this.sync()
	}

	/** Build the music-relevant view of the current game state. */
	private snapshot(state: GameState): MusicState {
		const opponentActive = state.phase === 'playing' && state.currentTeam !== this.localTeam
		const cpuThinking =
			opponentActive && this.isCpuTeam(state.currentTeam) && state.actedTiles.size === 0
		return {
			phase: state.phase,
			currentTeam: state.currentTeam,
			winner: state.winner,
			allies: this.allies,
			intro: this.intro,
			inactive: this.inactive,
			cpuThinking,
		}
	}

	/** Recompute the desired track and switch only when it changes. */
	private sync(): void {
		const track = musicForState(this.snapshot(get(this.store)), this.localTeam)
		if (track === this.current) return
		this.current = track
		if (track === null) {
			this.stopMusic()
			return
		}
		this.playMusic(track, { loop: !NON_LOOPING.has(track) })
	}
}
