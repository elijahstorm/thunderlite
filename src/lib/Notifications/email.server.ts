/**
 * Transactional email notifier (server-only).
 *
 * Sits between the app's triggers and the DontCode notifications gateway, and
 * owns the three things a raw `sendEmail` does not: recipient resolution
 * (`profiles.email`), per-user preferences (`notification_prefs`), and dedup
 * (`email_log`). It is deliberately best-effort — a notification is a side
 * effect of some other action (a friend request, a subscription change), so a
 * send failure here is logged and swallowed, never surfaced to the caller.
 *
 * Against the mock gateway (`pnpm mock`) sends are logged, not delivered, so
 * every trigger is safe to exercise locally.
 */
import { db, notifications } from '$lib/dontcode/server'
import { budgetPressure, noteRateLimit } from '$lib/Security/rateLimit'
import { logToErrorDb } from '$lib/Security/serverLogs'
import type { EmailContent } from './templates'

export type NotificationCategory = 'subscription' | 'social' | 'game'

interface Prefs {
	email_enabled: boolean
	subscription: boolean
	social: boolean
	game: boolean
}

/** The email on file for a user, or null when none was ever recorded. */
export async function recipientEmail(userAuth: string): Promise<string | null> {
	const row = await db.findOne<{ email: string | null }>('profiles', {
		where: { auth: userAuth },
		select: ['email'],
	})
	return row?.email ?? null
}

/** Display name for use in copy, falling back to a friendly generic. */
export async function profileName(userAuth: string): Promise<string> {
	const row = await db.findOne<{ display_name: string | null; username: string | null }>(
		'profiles',
		{ where: { auth: userAuth }, select: ['display_name', 'username'] }
	)
	return row?.display_name || row?.username || 'A ThunderLite player'
}

/**
 * Cache a user's email on their profile so notifications can reach them later.
 * Called opportunistically from authenticated actions where we hold both the
 * user id and their address. Best-effort and idempotent.
 */
export async function rememberEmail(userAuth: string, email: string | undefined): Promise<void> {
	if (!email) return
	try {
		const row = await db.findOne<{ email: string | null }>('profiles', {
			where: { auth: userAuth },
			select: ['email'],
		})
		if (row && row.email !== email) {
			await db.update('profiles', { auth: userAuth }, { email })
		}
	} catch (err) {
		await logToErrorDb(err)
	}
}

/** A user's email preferences, all defaulting on. */
export interface NotificationPrefs {
	email_enabled: boolean
	subscription: boolean
	social: boolean
	game: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
	email_enabled: true,
	subscription: true,
	social: true,
	game: true,
}

/** Read a user's preferences, treating a missing row as "all enabled". */
export async function getPrefs(userAuth: string): Promise<NotificationPrefs> {
	const row = await db.findOne<Prefs>('notification_prefs', { where: { user_auth: userAuth } })
	if (!row) return { ...DEFAULT_PREFS }
	return {
		email_enabled: row.email_enabled !== false,
		subscription: row.subscription !== false,
		social: row.social !== false,
		game: row.game !== false,
	}
}

/** Persist a user's preferences (upsert). */
export async function setPrefs(userAuth: string, prefs: NotificationPrefs): Promise<void> {
	await db.upsert(
		'notification_prefs',
		{ user_auth: userAuth },
		{ ...prefs, updated_at: new Date().toISOString() }
	)
}

/** Whether the user permits email for this category. Missing row means "all on". */
async function allows(userAuth: string, category: NotificationCategory): Promise<boolean> {
	const prefs = await db.findOne<Prefs>('notification_prefs', {
		where: { user_auth: userAuth },
	})
	if (!prefs) return true
	if (prefs.email_enabled === false) return false
	return prefs[category] !== false
}

export interface NotifyInput {
	/** The recipient user (used for preferences and email lookup). */
	userAuth: string
	category: NotificationCategory
	/** Stable per-event key, e.g. `pro-activated:<userAuth>:<subId>`. */
	dedupKey: string
	content: EmailContent
	/** Known address to skip the profile lookup (e.g. the acting user's email). */
	email?: string
}

/**
 * Send one notification: honor preferences, resolve the address, claim the
 * dedup key, then send. A given `dedupKey` sends at most once; a failed send
 * releases the claim so a later retry can try again.
 */
export async function notify(input: NotifyInput): Promise<void> {
	try {
		// `notifications` is the tightest budget the gateway grants — 60/min for
		// the whole project, against the database's 600 — and the hourly async
		// sweep can want two emails per expired room. Once it's spent, every
		// further send fails anyway; the only question is whether we pay a round
		// trip (plus the preference and recipient reads in front of it) to find
		// that out again. Skipping costs the same lost email for a fraction of the
		// traffic, and leaves the dedup key unclaimed so a later sweep can retry.
		if (budgetPressure('notifications')) return

		if (!(await allows(input.userAuth, input.category))) return

		const to = input.email ?? (await recipientEmail(input.userAuth))
		if (!to) return

		// Claim the key up front so concurrent/duplicate triggers can't both send.
		const claimed = await db.insertIgnoreConflict('email_log', {
			dedup_key: input.dedupKey,
			recipient: to,
			category: input.category,
			subject: input.content.subject,
			success: false,
		})
		if (!claimed) return

		// The gateway reports some failures in-band and raises others (an
		// unavailable or not-yet-enabled service throws a DontCodeError). Both
		// have to release the claim: a claim leaked on a throw is permanent, and
		// it silences that exact event forever even after the gateway recovers.
		let error: string | null = null
		try {
			const res = await notifications.sendEmail({
				to,
				subject: input.content.subject,
				markdownText: input.content.markdownText,
			})
			if (res.success) {
				await db.update(
					'email_log',
					{ dedup_key: input.dedupKey },
					{ success: true, message_id: res.messageId ?? null }
				)
				return
			}
			error = res.error ?? 'unknown'
		} catch (err) {
			// Teach the breaker which budget this was, so the rest of a sweep skips
			// the gateway instead of rediscovering the limit one email at a time.
			noteRateLimit(err, 'notifications')
			error = err instanceof Error ? err.message : `${err}`
		}

		// Release the claim so the next attempt can retry this event.
		await db.delete('email_log', { dedup_key: input.dedupKey })
		await logToErrorDb(`email send failed (${input.category}, ${input.dedupKey}): ${error}`)
	} catch (err) {
		await logToErrorDb(err, `notify ${input.category} ${input.dedupKey}`)
	}
}
