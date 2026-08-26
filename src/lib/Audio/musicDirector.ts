import { get, type Readable } from 'svelte/store'
import { gameState, type GameState, type GamePhase } from '$lib/Engine/gameState'
import {
	audioEngine,
	type MusicMix,
	type MusicMixOptions,
	type PlaySingleOptions,
} from '$lib/Audio/audioEngine'
import { MusicClock } from '$lib/Audio/musicClock'
import {
	packForMatch,
	packLayers,
	phraseSecondsForLoop,
	type MusicPack,
} from '$lib/Audio/musicPacks'
import { mixForMood, type MusicMood } from '$lib/Audio/musicVariation'

/**
 * Music director — drives the adaptive music bed in time with the game.
 *
 * The bed is a stack of instrumental layers (not mood tracks) all looping in
 * lockstep; the director never starts or stops one, it only moves gains and lets
 * the engine crossfade. Two inputs decide those gains:
 *
 *  1. GAME PHASE → a mood (`moodForState`). Whose turn it is, whether the CPU is
 *     thinking, whether the hurry timer has fired.
 *  2. THE PHRASE CLOCK → a variation index and a dwell count, which re-arrange
 *     the mood on musical boundaries so the same mood does not sound identical
 *     the tenth time you hear it (`mixForMood`).
 *
 * The second input is the point of the whole subsystem. Phase alone gives you a
 * state readout: six moods, one loop each, identical on every repeat, which is
 * how you end up muting your own game. Layering the clock on top means a long
 * enemy turn audibly sags (fatigue thins the arrangement) and your own turn
 * snapping back to the full band reads as an event.
 *
 * Stings (intro, win, lose) are non-looping one-shots on a separate channel, so
 * they are free to sit over the bed rather than replacing it.
 *
 * The decisions are pure functions (`moodForState`, `musicMixForState`,
 * `stingForState`) so every branch is unit-testable without real audio. The
 * side-effecting `MusicDirector` is a thin shell over them, and every dependency
 * (store, engine calls, phrase source, timers) is injectable.
 */

/** Non-looping one-shots. Not part of the bed. */
export type MusicStingId = 'game/intro' | 'game/win' | 'game/lose'

/** Any logical music id the director can ask the engine for. */
export type MusicTrackId = MusicStingId

/**
 * A match plays exactly one pack. Layers within a pack are interchangeable;
 * layers across packs are not (different tempos, different keys), so the pack is
 * chosen once from the match seed and held for the whole match. Variety across
 * packs is variety across matches, which is the axis players actually notice.
 */

/**
 * The minimal slice of state the mood mapping needs, decoupled from the concrete
 * game store so it can be exercised in isolation.
 */
export interface MusicState {
	phase: GamePhase
	currentTeam: number
	/** Winning team once the match is over (undefined on a draw). */
	winner?: number
	/** Teams allied with the local player (non-local). Relevant when teams > 2. */
	allies?: readonly number[]
	/** The intro sting is still playing before the bed settles into the turn mood. */
	intro?: boolean
	/** The active (opponent) CPU is still computing its move. */
	cpuThinking?: boolean
	/** The inactivity / hurry timer has fired. */
	inactive?: boolean
	/** Caller-driven lull (long animation, between-turn pause) — pull the bed back. */
	resting?: boolean
}

/**
 * Pure phase → mood. No side effects.
 *
 * Precedence, highest first:
 *  1. terminal game-over — bed silent, the sting owns the moment
 *  2. intro — bed sits back under the intro sting
 *  3. inactivity / hurry warning — overrides even the local turn
 *  4. caller-declared lull
 *  5. the local player's own turn
 *  6. CPU still computing an opponent move
 *  7. ally / enemy turn
 */
export function moodForState(state: MusicState, localTeam: number): MusicMood {
	if (state.phase === 'gameOver') return 'silent'
	if (state.intro) return 'rest'
	if (state.inactive) return 'hurry'
	if (state.resting) return 'rest'
	if (state.currentTeam === localTeam) return 'player'
	if (state.cpuThinking) return 'thinking'
	if (state.allies?.includes(state.currentTeam)) return 'ally'
	return 'enemy'
}

/**
 * Pure (state, clock position) → per-layer gains. `variation` and `dwell` come
 * from the phrase clock; passing 0 for both yields the mood's opening
 * arrangement, which is what a caller wants when it has no clock yet.
 */
export function musicMixForState(
	state: MusicState,
	localTeam: number,
	pack: MusicPack,
	variation = 0,
	dwell = 0,
	seed = 0
): MusicMix {
	return mixForMood(moodForState(state, localTeam), variation, dwell, seed, pack)
}

/**
 * Pure phase → sting decision. Returns the non-looping sting to play (or `null`
 * for "stop any sting").
 */
export function stingForState(state: MusicState, localTeam: number): MusicStingId | null {
	if (state.phase === 'gameOver') return state.winner === localTeam ? 'game/win' : 'game/lose'
	if (state.intro) return 'game/intro'
	return null
}

/**
 * A source of musical phrase edges. The director only needs to start it, stop
 * it, and ask where it is; tests supply a fake that fires on demand.
 */
export interface PhraseSource {
	start(): void
	stop(): void
	reset(): void
	/** Monotonic phrase count so far. */
	current(): number
}

type TimerHandle = ReturnType<typeof setTimeout>

export interface MusicDirectorOptions {
	/** The local human player's team. Defaults to `0`. */
	localTeam?: number
	/** Teams allied with the local player (for >2 team matches). */
	allies?: readonly number[]
	/**
	 * Whether a team is CPU-controlled — drives the "thinking" mood. Defaults to
	 * never (hot-seat: every opponent is human, so no thinking lull).
	 */
	isCpuTeam?: (team: number) => boolean
	/** Game state source. Defaults to the shared `gameState` store. */
	store?: Readable<GameState>
	/** Start the synced bed. Defaults to the shared audio engine. */
	startMusicStems?: (names: readonly string[]) => void
	/** Apply a layer mix (crossfaded). Defaults to the shared audio engine. */
	setMusicMix?: (mix: MusicMix, opts?: MusicMixOptions) => void
	/** Tear down the bed. Defaults to the shared audio engine. */
	stopMusicStems?: () => void
	/** Play a one-shot sting. Defaults to the shared audio engine. */
	playMusic?: (track: MusicTrackId, opts?: PlaySingleOptions) => void
	/** Stop the one-shot sting channel. Defaults to the shared audio engine. */
	stopMusic?: () => void
	/** Intro sting duration before the bed settles into the turn mood (ms). */
	introMs?: number
	/** Crossfade for a mood change — short, so turn flips feel responsive. */
	fadeMs?: number
	/**
	 * Crossfade for a variation change within one mood. Deliberately long: a
	 * re-arrangement should breathe, not announce itself as a switch.
	 */
	variationFadeMs?: number
	/**
	 * Pack to play. Defaults to one chosen from `seed`, so a replay hears the pack
	 * its live match did. Pass one explicitly to pin it (dev pages, tests).
	 */
	pack?: MusicPack
	/**
	 * Seconds of audio per phrase. Defaults to the pack's subdivision measured
	 * against the loop length the bed actually decoded, so every phrase edge lands
	 * on the grid — override only to deliberately go off-grid.
	 */
	phraseSeconds?: number
	/** Phrases to hold an arrangement before rolling the next one. */
	phrasesPerVariation?: number
	/**
	 * Arrangement seed. Same seed + same phase timeline → same arrangement, which
	 * is what lets a replay sound like the match it is replaying.
	 */
	seed?: number
	/** Phrase-edge source factory. Defaults to a clock over the audio engine. */
	phraseSource?: (onPhrase: (phrase: number) => void) => PhraseSource
	/** Injectable timer (testing). Defaults to `setTimeout`. */
	setTimer?: (fn: () => void, ms: number) => TimerHandle
	/** Injectable timer clear (testing). Defaults to `clearTimeout`. */
	clearTimer?: (handle: TimerHandle) => void
}

/**
 * The opening window: the bed holds at `rest` while the intro sting plays. The
 * sting asset is currently silence (see `assetManifest.ts`), so this reads as a
 * soft fade-in rather than a fanfare — the window is kept so a real sting can be
 * dropped back in without touching the director.
 */
const DEFAULT_INTRO_MS = 3500
const DEFAULT_FADE_MS = 800
const DEFAULT_VARIATION_FADE_MS = 2500
const DEFAULT_PHRASES_PER_VARIATION = 2

/** True when two mixes would sound identical, so we can skip a pointless fade. */
function sameMix(a: MusicMix, b: MusicMix | null): boolean {
	if (b === null) return false
	const aKeys = Object.keys(a)
	const bKeys = Object.keys(b)
	if (aKeys.length !== bKeys.length) return false
	return aKeys.every((k) => a[k] === b[k])
}

/**
 * Subscribes to the game store and drives the music bed. Construct one, call
 * `start()`, and `stop()` on teardown. All dependencies are injectable so the
 * director can run headless under vitest.
 */
export class MusicDirector {
	private readonly localTeam: number
	private readonly allies: readonly number[]
	private readonly isCpuTeam: (team: number) => boolean
	private readonly store: Readable<GameState>
	private readonly startStems: (names: readonly string[]) => void
	private readonly applyMix: (mix: MusicMix, opts?: MusicMixOptions) => void
	private readonly stopStems: () => void
	private readonly playMusic: (track: MusicTrackId, opts?: PlaySingleOptions) => void
	private readonly stopMusic: () => void
	private readonly introMs: number
	private readonly fadeMs: number
	private readonly variationFadeMs: number
	private readonly phrasesPerVariation: number
	private readonly seed: number
	private readonly pack: MusicPack
	private readonly clock: PhraseSource
	private readonly setTimer: (fn: () => void, ms: number) => TimerHandle
	private readonly clearTimer: (handle: TimerHandle) => void

	private unsubscribe: (() => void) | null = null
	private introTimer: TimerHandle | null = null
	private intro = false
	private inactive = false
	private resting = false
	private currentSting: MusicStingId | null = null

	/** Monotonic phrase count from the clock. */
	private phrase = 0
	/** Mood currently playing, and the phrase it started on (for fatigue). */
	private mood: MusicMood | null = null
	private moodStartPhrase = 0
	/** Last mix handed to the engine, so identical re-computes are dropped. */
	private lastMix: MusicMix | null = null

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
		this.variationFadeMs = opts.variationFadeMs ?? DEFAULT_VARIATION_FADE_MS
		this.phrasesPerVariation = Math.max(
			1,
			opts.phrasesPerVariation ?? DEFAULT_PHRASES_PER_VARIATION
		)
		this.seed = opts.seed ?? 0
		this.pack = opts.pack ?? packForMatch(this.seed)

		const onPhrase = (phrase: number): void => {
			this.phrase = phrase
			this.sync()
		}
		this.clock =
			opts.phraseSource?.(onPhrase) ??
			new MusicClock({
				phraseSeconds:
					opts.phraseSeconds ??
					(() => phraseSecondsForLoop(this.pack, audioEngine.getMusicBedStatus()?.loopSeconds)),
				position: () => audioEngine.getMusicPosition(),
				onPhrase,
			})

		this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
		this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h))
	}

	/**
	 * Begin driving music. Starts every layer of this match's pack in lockstep
	 * (silent), starts the phrase clock, then mixes up the first arrangement. On a fresh match (turn 1)
	 * the intro sting plays over a held-back bed for `introMs`.
	 */
	start(): void {
		if (this.unsubscribe) return

		this.startStems(packLayers(this.pack))
		this.clock.reset()
		this.phrase = 0
		this.mood = null
		this.moodStartPhrase = 0
		this.lastMix = null
		this.clock.start()

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

	/** Stop driving music and release the subscription, clock and timer. */
	stop(): void {
		if (this.introTimer !== null) {
			this.clearTimer(this.introTimer)
			this.introTimer = null
		}
		if (this.unsubscribe) {
			this.unsubscribe()
			this.unsubscribe = null
		}
		this.clock.stop()
		this.clock.reset()
		this.intro = false
		this.inactive = false
		this.resting = false
		this.currentSting = null
		this.mood = null
		this.lastMix = null
		this.stopStems()
		this.stopMusic()
	}

	/** Set the inactivity / hurry-warning flag. */
	setInactive(inactive: boolean): void {
		if (this.inactive === inactive) return
		this.inactive = inactive
		this.sync()
	}

	/**
	 * Declare a lull — a long attack animation, a between-turn pause, anything
	 * where the bed should get out of the way. Rest is not a fallback state; it is
	 * the thing that makes the next full arrangement land, so callers should reach
	 * for it liberally.
	 */
	setResting(resting: boolean): void {
		if (this.resting === resting) return
		this.resting = resting
		this.sync()
	}

	/** The mood currently playing (for the audio dev page / tests). */
	currentMood(): MusicMood | null {
		return this.mood
	}

	/** The pack this match is playing. Fixed for the match's lifetime. */
	currentPack(): MusicPack {
		return this.pack
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
			resting: this.resting,
			cpuThinking,
		}
	}

	/** Recompute the desired arrangement + sting and apply both. */
	private sync(): void {
		const snap = this.snapshot(get(this.store))

		const mood = moodForState(snap, this.localTeam)
		const moodChanged = mood !== this.mood
		if (moodChanged) {
			this.mood = mood
			// Dwell restarts, so a mood returning after a break comes back at full
			// strength rather than inheriting the fatigue of its last outing.
			this.moodStartPhrase = this.phrase
		}

		const dwell = this.phrase - this.moodStartPhrase
		const variation = Math.floor(this.phrase / this.phrasesPerVariation)
		const mix = mixForMood(mood, variation, dwell, this.seed, this.pack)

		// A mood change is news and fades fast; a re-arrangement inside one mood
		// should slide under the player's attention, so it gets the long fade.
		if (!sameMix(mix, this.lastMix)) {
			this.lastMix = mix
			this.applyMix(mix, { fadeMs: moodChanged ? this.fadeMs : this.variationFadeMs })
		}

		const sting = stingForState(snap, this.localTeam)
		if (sting === this.currentSting) return
		this.currentSting = sting
		if (sting === null) this.stopMusic()
		else this.playMusic(sting, { loop: false })
	}
}
