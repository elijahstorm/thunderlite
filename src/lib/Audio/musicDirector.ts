import { get, type Readable } from 'svelte/store'
import { gameState, type GameState, type GamePhase } from '$lib/Engine/gameState'
import {
	audioEngine,
	type MusicMix,
	type MusicMixOptions,
	type PlaySingleOptions,
} from '$lib/Audio/audioEngine'

/**
 * Music director — drives the adaptive music stem layer in time with the game
 * phase. Every looping stem (intro, player, enemy, ally, thinking, inactive)
 * is started together and kept playing for the lifetime of the match; the
 * director only moves per-stem target gains and the audio engine crossfades
 * them. Because the stems share a BPM and key and are started in lockstep,
 * transitions feel musical instead of sounding like an abrupt cut.
 *
 * Win / lose stings are non-looping one-shots and travel a separate path
 * (`playMusic` on the engine), so they aren't part of the synced stem layer.
 *
 * The decisions are pure functions (`musicMixForState`, `stingForState`) so
 * every phase branch is unit-testable without real audio. The side-effecting
 * `MusicDirector` is a thin shell that derives the phase flags from the game
 * store and applies them via the engine.
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

/** Looping stems started in lockstep and crossfaded by the director. */
export const MUSIC_STEMS: readonly MusicTrackId[] = [
	'game/intro',
	'game/player',
	'game/enemy',
	'game/ally',
	'game/thinking',
	'game/inactive',
] as const

/** Logical stems for the looping stem layer (no win/lose). */
export type MusicStemId = (typeof MUSIC_STEMS)[number]

/** One-shot stings (non-looping, not part of the stem layer). */
export type MusicStingId = 'game/win' | 'game/lose'

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
 * Pure phase → stem-gain mix. No side effects. Stems missing from the result
 * are interpreted as gain 0 by the engine. Exactly one stem is at full gain
 * at a time, but because every stem keeps looping in the background the
 * transition between them is a clean crossfade rather than a track restart.
 *
 * Precedence, highest first:
 *  1. terminal game-over — all stems silent (the sting plays separately)
 *  2. intro sting layer (game just started)
 *  3. inactivity / hurry warning (overrides the local turn theme)
 *  4. local player's own turn theme
 *  5. CPU "thinking" while an opponent computes its move
 *  6. ally / enemy turn theme
 */
export function musicMixForState(state: MusicState, localTeam: number): MusicMix {
	if (state.phase === 'gameOver') return {}
	if (state.intro) return { 'game/intro': 1 }
	if (state.inactive) return { 'game/inactive': 1 }
	if (state.currentTeam === localTeam) return { 'game/player': 1 }
	if (state.cpuThinking) return { 'game/thinking': 1 }
	if (state.allies?.includes(state.currentTeam)) return { 'game/ally': 1 }
	return { 'game/enemy': 1 }
}

/**
 * Pure phase → sting decision. Returns the non-looping sting to play (or
 * `null` for "stop any sting"). Whoever owns playback fades the stem layer
 * down alongside the sting.
 */
export function stingForState(state: MusicState, localTeam: number): MusicStingId | null {
	if (state.phase !== 'gameOver') return null
	return state.winner === localTeam ? 'game/win' : 'game/lose'
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
	/** Start the synced stem layer. Defaults to the shared audio engine. */
	startMusicStems?: (names: readonly MusicStemId[]) => void
	/** Apply a stem mix (crossfaded). Defaults to the shared audio engine. */
	setMusicMix?: (mix: MusicMix, opts?: MusicMixOptions) => void
	/** Tear down the stem layer. Defaults to the shared audio engine. */
	stopMusicStems?: () => void
	/** Play a one-shot sting. Defaults to the shared audio engine. */
	playMusic?: (track: MusicTrackId, opts?: PlaySingleOptions) => void
	/** Stop the one-shot sting channel. Defaults to the shared audio engine. */
	stopMusic?: () => void
	/** Intro sting duration before settling into the turn theme (ms). */
	introMs?: number
	/** Crossfade duration between stem mixes (ms). */
	fadeMs?: number
	/** Injectable timer (testing). Defaults to `setTimeout`. */
	setTimer?: (fn: () => void, ms: number) => TimerHandle
	/** Injectable timer clear (testing). Defaults to `clearTimeout`. */
	clearTimer?: (handle: TimerHandle) => void
}

const DEFAULT_INTRO_MS = 3500
const DEFAULT_FADE_MS = 800

/**
 * Subscribes to the game store and drives the music stem layer. Construct one,
 * call `start()`, and `stop()` on teardown. All dependencies are injectable so
 * the director can run headless under vitest.
 */
export class MusicDirector {
	private readonly localTeam: number
	private readonly allies: readonly number[]
	private readonly isCpuTeam: (team: number) => boolean
	private readonly store: Readable<GameState>
	private readonly startStems: (names: readonly MusicStemId[]) => void
	private readonly applyMix: (mix: MusicMix, opts?: MusicMixOptions) => void
	private readonly stopStems: () => void
	private readonly playMusic: (track: MusicTrackId, opts?: PlaySingleOptions) => void
	private readonly stopMusic: () => void
	private readonly introMs: number
	private readonly fadeMs: number
	private readonly setTimer: (fn: () => void, ms: number) => TimerHandle
	private readonly clearTimer: (handle: TimerHandle) => void

	private unsubscribe: (() => void) | null = null
	private introTimer: TimerHandle | null = null
	private intro = false
	private inactive = false
	private currentSting: MusicStingId | null = null

	constructor(opts: MusicDirectorOptions = {}) {
		this.localTeam = opts.localTeam ?? 0
		this.allies = opts.allies ?? []
		this.isCpuTeam = opts.isCpuTeam ?? (() => false)
		this.store = opts.store ?? gameState
		this.startStems = opts.startMusicStems ?? ((names) => audioEngine.startMusicStems(names))
		this.applyMix = opts.setMusicMix ?? ((mix, o) => audioEngine.setMusicMix(mix, o))
		this.stopStems = opts.stopMusicStems ?? (() => audioEngine.stopMusicStems())
		this.playMusic = opts.playMusic ?? ((track, o) => audioEngine.playMusic(track, o))
		this.stopMusic = opts.stopMusic ?? (() => audioEngine.stopMusic())
		this.introMs = opts.introMs ?? DEFAULT_INTRO_MS
		this.fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS
		this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
		this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h))
	}

	/**
	 * Begin driving music. Starts every looping stem in lockstep (silent), then
	 * mixes up the first state's stem. On a fresh match (turn 1) the intro stem
	 * leads for `introMs` before crossfading into the turn theme.
	 */
	start(): void {
		if (this.unsubscribe) return

		this.startStems(MUSIC_STEMS)

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
		this.currentSting = null
		this.stopStems()
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

	/** Recompute the desired mix + sting and apply both. */
	private sync(): void {
		const snap = this.snapshot(get(this.store))
		this.applyMix(musicMixForState(snap, this.localTeam), { fadeMs: this.fadeMs })

		const sting = stingForState(snap, this.localTeam)
		if (sting === this.currentSting) return
		this.currentSting = sting
		if (sting === null) this.stopMusic()
		else this.playMusic(sting, { loop: false })
	}
}
