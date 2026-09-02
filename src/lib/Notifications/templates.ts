/**
 * Email bodies for ThunderLite notifications.
 *
 * Content is GitHub-flavored Markdown, the only body format the DontCode
 * notifications gateway accepts. Each builder returns `{ subject, markdownText }`
 * ready to hand to the notifier. Keep the copy plain and warm; no em dashes in
 * anything a user reads (house style), and no HTML.
 *
 * Every email carries a link straight to the thing it is about (the friends
 * list holding the request, the room whose turn is yours, the replay of the
 * match that just ended), because the alternative is making the reader go find
 * it. That is why builders take ids and not just display names.
 *
 * Server-only: the links need the deployment's public origin.
 */
import { env } from '$env/dynamic/private'

export interface EmailContent {
	subject: string
	markdownText: string
}

/**
 * Absolute base for links in an email body. Mail clients render outside the app,
 * so a root-relative href would resolve against the client's own domain and
 * dead-end; `SITE_URL` lets a preview deploy point its emails at itself instead
 * of production.
 */
const siteUrl = (env.SITE_URL || 'https://thunderlite.vercel.app').replace(/\/$/, '')

/** Absolute in-app URL for a root-relative path. */
const link = (path: string): string => `${siteUrl}${path}`

/** Public profile of another player. Auth ids are opaque, so escape them. */
const profileUrl = (userAuth: string): string => link(`/users/${encodeURIComponent(userAuth)}`)

/** The one-to-one conversation with another player. */
const chatUrl = (userAuth: string): string => link(`/chat/${encodeURIComponent(userAuth)}`)

/**
 * A room, live or async. The lobby forwards into `/play` once the match has
 * started, so this one link works for "come ready up" and "it is your move"
 * alike, and keeps working after the game ends (the final board).
 */
const roomUrl = (session: string): string => link(`/rooms/${encodeURIComponent(session)}`)

/** The replay/result page for a recorded match. */
const replayUrl = (matchId: number | string): string =>
	link(`/replays/${encodeURIComponent(String(matchId))}`)

const friendsUrl = link('/my/friends')
const gamesUrl = link('/my/games')
const roomsUrl = link('/rooms')
const proUrl = link('/my/pro')

const prefsFooter = `\n\n---\n\nYou can change which emails you get from [Settings](${siteUrl}/my/settings) in ThunderLite.`

const formatDate = (iso: string | null): string =>
	iso
		? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
		: 'the end of the current period'

// ── Subscription lifecycle ──────────────────────────────────────────────────

export const proActivated = (planLabel: string, periodEnd: string | null): EmailContent => ({
	subject: 'Thank you for supporting ThunderLite',
	markdownText: `# You are a supporter now

Thank you for backing **ThunderLite** (${planLabel} support).

Your support renews on **${formatDate(periodEnd)}**. You can [manage or cancel it any time](${proUrl}).${prefsFooter}`,
})

export const proCanceled = (periodEnd: string | null): EmailContent => ({
	subject: 'Your ThunderLite support is set to end',
	markdownText: `# Cancellation confirmed

Your recurring support will not renew after **${formatDate(periodEnd)}**.

Thank you for having supported the project. If you change your mind, you can [resume any time](${proUrl}).${prefsFooter}`,
})

export const proResumed = (periodEnd: string | null): EmailContent => ({
	subject: 'Your ThunderLite support is active again',
	markdownText: `# Welcome back

Your recurring support is active again and will renew on **${formatDate(
		periodEnd
	)}**. Thank you for keeping the project going.

[View your supporter status](${proUrl})${prefsFooter}`,
})

export const donationThanks = (amountLabel: string): EmailContent => ({
	subject: 'Thank you for your donation',
	markdownText: `# Thank you

Your **${amountLabel}** donation to ThunderLite went through.

[View your supporter page](${proUrl})${prefsFooter}`,
})

// ── Social / inbox ───────────────────────────────────────────────────────────

export const friendRequest = (fromName: string, fromAuth: string): EmailContent => ({
	subject: `${fromName} sent you a friend request`,
	markdownText: `# New friend request

**[${fromName}](${profileUrl(fromAuth)})** wants to be friends on ThunderLite.

[Accept or ignore the request](${friendsUrl})${prefsFooter}`,
})

export const friendAccepted = (fromName: string, fromAuth: string): EmailContent => ({
	subject: `${fromName} accepted your friend request`,
	markdownText: `# You are friends now

**[${fromName}](${profileUrl(fromAuth)})** accepted your friend request on ThunderLite.

[Send them a message](${chatUrl(fromAuth)}) or [open your friends list](${friendsUrl})${prefsFooter}`,
})

export const newMessage = (fromName: string, preview: string, fromAuth: string): EmailContent => ({
	subject: `New message from ${fromName}`,
	markdownText: `# ${fromName} sent you a message

> ${preview}

[Open the conversation](${chatUrl(fromAuth)})${prefsFooter}`,
})

// ── Game events ───────────────────────────────────────────────────────────────

export const matchResult = (
	outcome: 'win' | 'loss' | 'draw',
	opponentName: string | null,
	matchId: number | string
): EmailContent => {
	const vs = opponentName ? ` against ${opponentName}` : ''
	const headline =
		outcome === 'win' ? 'Victory!' : outcome === 'loss' ? 'Hard-fought loss' : 'It ended in a draw'
	const line =
		outcome === 'win'
			? `You won your match${vs}. Well played.`
			: outcome === 'loss'
				? `Your match${vs} did not go your way. Rematch?`
				: `Your match${vs} ended in a draw.`
	return {
		subject: `Match result: ${headline}`,
		markdownText: `# ${headline}

${line}

[See the full result](${replayUrl(matchId)}) or [browse your match history](${gamesUrl})${prefsFooter}`,
	}
}

// ── Async (correspondence) games ─────────────────────────────────────────────

/** It is your turn in an async match; `timeLabel` is the per-turn clock, e.g. '3 days'. */
export const asyncYourTurn = (
	opponentName: string | null,
	timeLabel: string,
	session: string
): EmailContent => ({
	subject: 'Your move in your async ThunderLite match',
	markdownText: `# Your move

${opponentName ? `**${opponentName}** finished their turn. ` : ''}You have **${timeLabel}** on the clock.

[Take your turn](${roomUrl(session)})${prefsFooter}`,
})

/** Sent to the player whose turn clock ran out. */
export const asyncAutoResigned = (
	opponentName: string | null,
	timeLabel: string
): EmailContent => ({
	subject: 'Your async match timed out',
	markdownText: `# Out of time

Your turn clock of **${timeLabel}** ran out, so your async ThunderLite match${opponentName ? ` against **${opponentName}**` : ''} was resigned automatically.

[Look back at your match history](${gamesUrl})${prefsFooter}`,
})

/** Sent to the opponent when a player resigned an async match by hand. */
export const asyncOpponentResigned = (
	opponentName: string | null,
	session: string
): EmailContent => ({
	subject: 'Your opponent resigned your async match',
	markdownText: `# Victory by resignation

${opponentName ? `**${opponentName}**` : 'Your opponent'} resigned your async ThunderLite match, so the win is yours.

[See the final board](${roomUrl(session)}) or [start a rematch](${roomsUrl}).${prefsFooter}`,
})

/** Sent to the opponent when the current player's clock ran out. */
export const asyncOpponentTimedOut = (
	opponentName: string | null,
	session: string
): EmailContent => ({
	subject: 'You won your async match on time',
	markdownText: `# Victory on time

${opponentName ? `**${opponentName}**` : 'Your opponent'} ran out of time in your async ThunderLite match, so the win is yours.

[See the final board](${roomUrl(session)}) or [start a rematch](${roomsUrl}).${prefsFooter}`,
})
