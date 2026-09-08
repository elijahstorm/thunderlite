/**
 * Async (correspondence) multiplayer configuration — shared by client and
 * server, so keep this module free of server-only imports.
 *
 * An async room plays the same event-sourced game as a live room, but turns
 * unfold over days: each turn carries a deadline (`game_room.turn_deadline`),
 * and a player who doesn't end their turn before it is auto-resigned. The
 * per-turn allowance is chosen by the host at creation from the presets below
 * and clamped server-side to [MIN, MAX] so a hostile client can't create a
 * 10-second or 10-year turn clock.
 */

export type GameMode = 'live' | 'async'

export const isGameMode = (v: unknown): v is GameMode => v === 'live' || v === 'async'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Realistic bounds for a per-turn clock: half a day up to two weeks. */
export const ASYNC_TURN_TIMEOUT_MIN_MS = 12 * HOUR_MS
export const ASYNC_TURN_TIMEOUT_MAX_MS = 14 * DAY_MS
export const ASYNC_TURN_TIMEOUT_DEFAULT_MS = 3 * DAY_MS

/** The turn clocks the host can pick from at game creation. */
export const ASYNC_TURN_TIMEOUT_PRESETS: { ms: number; label: string }[] = [
	{ ms: 12 * HOUR_MS, label: '12 hours' },
	{ ms: 1 * DAY_MS, label: '1 day' },
	{ ms: 2 * DAY_MS, label: '2 days' },
	{ ms: 3 * DAY_MS, label: '3 days' },
	{ ms: 7 * DAY_MS, label: '7 days' },
	{ ms: 14 * DAY_MS, label: '14 days' },
]

/** Coerce an arbitrary client-supplied timeout into the allowed range. */
export const clampAsyncTimeout = (ms: unknown): number => {
	const n = Number(ms)
	if (!Number.isFinite(n)) return ASYNC_TURN_TIMEOUT_DEFAULT_MS
	return Math.min(ASYNC_TURN_TIMEOUT_MAX_MS, Math.max(ASYNC_TURN_TIMEOUT_MIN_MS, Math.trunc(n)))
}

/** '3 days' / '12 hours' — for lobby copy and emails. */
export const formatTurnTimeout = (ms: number): string => {
	if (ms >= DAY_MS) {
		const days = Math.round(ms / DAY_MS)
		return days === 1 ? '1 day' : `${days} days`
	}
	const hours = Math.max(1, Math.round(ms / HOUR_MS))
	return hours === 1 ? '1 hour' : `${hours} hours`
}

/**
 * Compact remaining-time readout for countdowns: '2d 14h', '3h 12m', '4m'.
 * A zero remainder is dropped rather than padded — '19h', not '19h 0m'.
 */
export const formatTimeLeft = (ms: number): string => {
	const clamped = Math.max(0, ms)
	const minutes = Math.floor(clamped / 60_000)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)
	if (days > 0) return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`
	if (hours > 0) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`
	return `${minutes}m`
}

/**
 * How much trouble a turn clock is in. Drives the colour of every deadline
 * readout in the site UI, so "you have hours left" never looks the same as
 * "you have days left".
 */
export type TurnUrgency = 'expired' | 'critical' | 'soon' | 'calm'

export const turnUrgency = (msLeft: number | null): TurnUrgency => {
	if (msLeft == null) return 'calm'
	if (msLeft <= 0) return 'expired'
	if (msLeft < 6 * HOUR_MS) return 'critical'
	if (msLeft < 24 * HOUR_MS) return 'soon'
	return 'calm'
}

/** 'a moment ago' / '3 hours ago' / '2 days ago' — for "last move" lines. */
export const formatAgo = (at: number | null): string | null => {
	if (at == null) return null
	const ms = Date.now() - at
	if (ms < 2 * 60_000) return 'a moment ago'
	const minutes = Math.floor(ms / 60_000)
	if (minutes < 60) return `${minutes} minutes ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
	const days = Math.floor(hours / 24)
	return days === 1 ? 'yesterday' : `${days} days ago`
}
