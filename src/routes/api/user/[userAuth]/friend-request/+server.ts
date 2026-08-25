import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { clearRelationship, setRelationship } from '$lib/Database/Relationships/relationships.js'
import { notify, profileName, rememberEmail } from '$lib/Notifications/email.server'
import { friendAccepted, friendRequest } from '$lib/Notifications/templates'

/**
 * Send a friend request, or accept one the target already sent (asking back is
 * the accept). The response carries the resulting `RelationshipStatus`, so the
 * caller can repaint its button without a reload.
 */
export const POST = async ({ params, locals }) => {
	const source = locals.user
	const target = params.userAuth
	try {
		const result = await setRelationship({ source, target, status: 'friend-request' })

		// Day-bucketed, like the DM notifier's hour bucket. A request can be
		// declined and sent again, so a permanent key would mean the second one
		// never mails; it also lets a claim stranded by a crashed send recover on
		// its own instead of silencing that pair forever.
		const day = new Date().toISOString().slice(0, 10)

		if (source && (result.outcome === 'created' || result.outcome === 'updated')) {
			// A genuinely new pending request: tell them it's waiting.
			await rememberEmail(source, locals.userEmail)
			await notify({
				userAuth: target,
				category: 'social',
				dedupKey: `friend-request:${source}:${target}:${day}`,
				content: friendRequest(await profileName(source), source),
			})
		} else if (source && result.outcome === 'auto-accepted') {
			// They asked first, so this call accepted. The person who waited is the
			// one who wants to hear about it.
			await rememberEmail(source, locals.userEmail)
			await notify({
				userAuth: target,
				category: 'social',
				dedupKey: `friend-accepted:${target}:${source}:${day}`,
				content: friendAccepted(await profileName(source), source),
			})
		}

		return json(result)
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Invalid target auth string')
	}
}

/**
 * Drop the pending request between the two of you, whichever way it points:
 * declining one you received and cancelling one you sent are the same intent.
 * Friendships and blocks are left alone.
 */
export const DELETE = async ({ params, locals }) => {
	const source = locals.user
	const target = params.userAuth
	if (!source) return json({ status: 'unknown', cleared: false })
	try {
		const [outgoing, incoming] = await Promise.all([
			clearRelationship(source, target, ['friend-request']),
			clearRelationship(target, source, ['friend-request']),
		])
		return json({ status: 'unknown', cleared: outgoing || incoming })
	} catch (msg) {
		await logToErrorDb(msg)
		throw error(500, 'Could not access database')
	}
}
