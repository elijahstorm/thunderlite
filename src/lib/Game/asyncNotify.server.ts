/**
 * Email side-effects for async (correspondence) games — server-only.
 *
 * Async players are offline between turns by design, so email is the only way
 * they learn the game moved: "your turn" after every opponent end-turn, and
 * the two timeout notices when a turn clock runs out. Everything here is
 * best-effort (the notifier logs and swallows failures) and deduped per event
 * id, so the lazy enforcement paths and the cron can all call these without
 * double-sending.
 */
import { notify, profileName } from '$lib/Notifications/email.server'
import {
	asyncAutoResigned,
	asyncOpponentResigned,
	asyncOpponentTimedOut,
	asyncYourTurn,
} from '$lib/Notifications/templates'
import { formatTurnTimeout } from '$lib/Game/asyncConfig'
import type { AsyncResignResult } from '$lib/Game/store.server'

/**
 * Tell `nextUserAuth` it is their move. `eventId` keys the dedup (one email
 * per turn handover); `opponentAuth` names who just moved in the copy.
 */
export async function notifyAsyncYourTurn(input: {
	session: string
	eventId: number | string
	nextUserAuth: string | null
	opponentAuth: string | null
	turnTimeoutMs: number
}): Promise<void> {
	if (!input.nextUserAuth) return
	const opponentName = input.opponentAuth ? await profileName(input.opponentAuth) : null
	await notify({
		userAuth: input.nextUserAuth,
		category: 'game',
		dedupKey: `async-turn:${input.session}:${input.eventId}`,
		content: asyncYourTurn(opponentName, formatTurnTimeout(input.turnTimeoutMs)),
	})
}

/**
 * Tell the surviving opponent a player resigned by hand (in-game surrender or
 * leaving the room). Async opponents are usually offline when it happens, so
 * without this they would only learn the match ended on their next visit.
 */
export async function notifyAsyncResignation(input: {
	session: string
	eventId: number | string
	resignedUserAuth: string | null
	opponentUserAuth: string | null
}): Promise<void> {
	if (!input.opponentUserAuth) return
	const resignedName = input.resignedUserAuth ? await profileName(input.resignedUserAuth) : null
	await notify({
		userAuth: input.opponentUserAuth,
		category: 'game',
		dedupKey: `async-resign:${input.session}:${input.eventId}`,
		content: asyncOpponentResigned(resignedName),
	})
}

/**
 * Fan out the notices for an enforced timeout: the resigned player learns
 * their clock ran out; the opponent learns they won (or, were the game to
 * continue with more players, that it is now their move).
 */
export async function notifyAsyncTimeout(
	session: string,
	result: AsyncResignResult,
	turnTimeoutMs: number
): Promise<void> {
	const timeLabel = formatTurnTimeout(turnTimeoutMs)
	const [resignedName, nextName] = await Promise.all([
		result.resigned.userAuth ? profileName(result.resigned.userAuth) : Promise.resolve(null),
		result.next?.userAuth ? profileName(result.next.userAuth) : Promise.resolve(null),
	])

	if (result.resigned.userAuth) {
		await notify({
			userAuth: result.resigned.userAuth,
			category: 'game',
			dedupKey: `async-timeout:${session}:${result.eventId}:resigned`,
			content: asyncAutoResigned(nextName, timeLabel),
		})
	}
	if (result.next?.userAuth) {
		await notify({
			userAuth: result.next.userAuth,
			category: 'game',
			dedupKey: `async-timeout:${session}:${result.eventId}:opponent`,
			content: result.gameOver
				? asyncOpponentTimedOut(resignedName)
				: asyncYourTurn(resignedName, timeLabel),
		})
	}
}
