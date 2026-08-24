/**
 * Email bodies for ThunderLite notifications.
 *
 * Content is GitHub-flavored Markdown, the only body format the DontCode
 * notifications gateway accepts. Each builder returns `{ subject, markdownText }`
 * ready to hand to the notifier. Keep the copy plain and warm; no em dashes in
 * anything a user reads (house style), and no HTML.
 */

export interface EmailContent {
	subject: string
	markdownText: string
}

const signoff = '\n\nSee you on the battlefield,\nThe ThunderLite team'

const prefsFooter = '\n\n---\n\nYou can change which emails you get from Settings in ThunderLite.'

const formatDate = (iso: string | null): string =>
	iso
		? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
		: 'the end of the current period'

// ── Subscription lifecycle ──────────────────────────────────────────────────

export const proActivated = (planLabel: string, periodEnd: string | null): EmailContent => ({
	subject: 'Thank you for supporting ThunderLite',
	markdownText: `# You are a supporter now

Thank you for backing **ThunderLite** (${planLabel} support). The game is built by one person, and recurring support is what keeps the servers running and new content coming. It means a lot.

Your support renews on **${formatDate(periodEnd)}**. You can manage or cancel any time from Settings.${signoff}${prefsFooter}`,
})

export const proCanceled = (periodEnd: string | null): EmailContent => ({
	subject: 'Your ThunderLite support is set to end',
	markdownText: `# Cancellation confirmed

Your recurring support will not renew after **${formatDate(
		periodEnd
	)}**. Nothing about your account changes: ThunderLite has no paywalled content, so everything stays exactly as it is.

Thank you for having supported the project. If you change your mind, you can resume any time from Settings.${signoff}${prefsFooter}`,
})

export const proResumed = (periodEnd: string | null): EmailContent => ({
	subject: 'Your ThunderLite support is active again',
	markdownText: `# Welcome back

Good to have you back. Your recurring support is active again and will renew on **${formatDate(
		periodEnd
	)}**. Thank you for keeping the project going.${signoff}${prefsFooter}`,
})

export const donationThanks = (amountLabel: string): EmailContent => ({
	subject: 'Thank you for your donation',
	markdownText: `# Thank you

Your **${amountLabel}** donation to ThunderLite went through. The game is a one-person project with no paywalled content, so donations like yours are what keep the servers running and new maps, units, and campaign chapters coming.

Genuinely: thank you.${signoff}${prefsFooter}`,
})

// ── Social / inbox ───────────────────────────────────────────────────────────

export const friendRequest = (fromName: string): EmailContent => ({
	subject: `${fromName} sent you a friend request`,
	markdownText: `# New friend request

**${fromName}** wants to be friends on ThunderLite.

Open your friends list in ThunderLite to accept or ignore the request.${prefsFooter}`,
})

export const friendAccepted = (fromName: string): EmailContent => ({
	subject: `${fromName} accepted your friend request`,
	markdownText: `# You are friends now

**${fromName}** accepted your friend request on ThunderLite. You will find each other in your friends list, and you can start a game or send a message any time.${prefsFooter}`,
})

export const newFollower = (fromName: string): EmailContent => ({
	subject: `${fromName} started following you`,
	markdownText: `# You have a new follower

**${fromName}** is now following you on ThunderLite.${prefsFooter}`,
})

export const newMessage = (fromName: string, preview: string): EmailContent => ({
	subject: `New message from ${fromName}`,
	markdownText: `# ${fromName} sent you a message

> ${preview}

Open ThunderLite to read it and reply.${prefsFooter}`,
})

// ── Game events ───────────────────────────────────────────────────────────────

export const matchResult = (
	outcome: 'win' | 'loss' | 'draw',
	opponentName: string | null
): EmailContent => {
	const vs = opponentName ? ` against ${opponentName}` : ''
	const headline =
		outcome === 'win' ? 'Victory!' : outcome === 'loss' ? 'Hard-fought loss' : 'It ended in a draw'
	const line =
		outcome === 'win'
			? `You won your match${vs}. Well played.`
			: outcome === 'loss'
				? `Your match${vs} did not go your way this time. Rematch?`
				: `Your match${vs} ended in a draw.`
	return {
		subject: `Match result: ${headline}`,
		markdownText: `# ${headline}

${line}${prefsFooter}`,
	}
}

export const yourTurn = (opponentName: string | null): EmailContent => ({
	subject: 'It is your turn on ThunderLite',
	markdownText: `# Your move

${opponentName ? `**${opponentName}** has moved. ` : ''}It is your turn in your ThunderLite match. Jump back in when you are ready.${prefsFooter}`,
})

// ── Async (correspondence) games ─────────────────────────────────────────────

/** It is your turn in an async match; `timeLabel` is the per-turn clock, e.g. '3 days'. */
export const asyncYourTurn = (opponentName: string | null, timeLabel: string): EmailContent => ({
	subject: 'Your move in your async ThunderLite match',
	markdownText: `# Your move

${opponentName ? `**${opponentName}** finished their turn. ` : ''}It is your turn in your async ThunderLite match.

You have **${timeLabel}** to finish your turn. If the clock runs out, the match is resigned automatically.${signoff}${prefsFooter}`,
})

/** Sent to the player whose turn clock ran out. */
export const asyncAutoResigned = (
	opponentName: string | null,
	timeLabel: string
): EmailContent => ({
	subject: 'Your async match timed out',
	markdownText: `# Out of time

Your turn clock of **${timeLabel}** ran out, so your async ThunderLite match${opponentName ? ` against **${opponentName}**` : ''} was resigned automatically.

Up for another? Start a fresh game any time.${signoff}${prefsFooter}`,
})

/** Sent to the opponent when a player resigned an async match by hand. */
export const asyncOpponentResigned = (opponentName: string | null): EmailContent => ({
	subject: 'Your opponent resigned your async match',
	markdownText: `# Victory by resignation

${opponentName ? `**${opponentName}**` : 'Your opponent'} resigned your async ThunderLite match, so the win is yours.

Jump back in to see the final board or start a rematch.${signoff}${prefsFooter}`,
})

/** Sent to the opponent when the current player's clock ran out. */
export const asyncOpponentTimedOut = (opponentName: string | null): EmailContent => ({
	subject: 'You won your async match on time',
	markdownText: `# Victory on time

${opponentName ? `**${opponentName}**` : 'Your opponent'} ran out of time in your async ThunderLite match, so the win is yours.

Jump back in to see the final board or start a rematch.${signoff}${prefsFooter}`,
})
