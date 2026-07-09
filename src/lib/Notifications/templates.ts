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

const prefsFooter =
	'\n\n---\n\nYou can change which emails you get from Settings in ThunderLite.'

const formatDate = (iso: string | null): string =>
	iso
		? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
		: 'the end of the current period'

// ── Subscription lifecycle ──────────────────────────────────────────────────

export const proActivated = (planLabel: string, periodEnd: string | null): EmailContent => ({
	subject: 'Welcome to ThunderLite Pro',
	markdownText: `# You are Pro now

Thanks for upgrading to **ThunderLite Pro** (${planLabel}). Your perks are live right away.

Your plan renews on **${formatDate(periodEnd)}**. You can manage or cancel any time from Settings.${signoff}${prefsFooter}`,
})

export const proCanceled = (periodEnd: string | null): EmailContent => ({
	subject: 'Your ThunderLite Pro plan is set to end',
	markdownText: `# Cancellation confirmed

Your ThunderLite Pro subscription will not renew. You keep every Pro perk until **${formatDate(
		periodEnd
	)}**, then your account returns to the free tier.

Changed your mind? You can resume before then from Settings, and nothing is lost.${signoff}${prefsFooter}`,
})

export const proResumed = (periodEnd: string | null): EmailContent => ({
	subject: 'Your ThunderLite Pro plan is active again',
	markdownText: `# Welcome back to Pro

Good to have you back. Your ThunderLite Pro subscription is active again and will renew on **${formatDate(
		periodEnd
	)}**.${signoff}${prefsFooter}`,
})

// ── Social / inbox ───────────────────────────────────────────────────────────

export const friendRequest = (fromName: string): EmailContent => ({
	subject: `${fromName} sent you a friend request`,
	markdownText: `# New friend request

**${fromName}** wants to be friends on ThunderLite.

Open your friends list to accept or ignore the request.${prefsFooter}`,
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
		outcome === 'win'
			? 'Victory!'
			: outcome === 'loss'
				? 'Hard-fought loss'
				: 'It ended in a draw'
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
