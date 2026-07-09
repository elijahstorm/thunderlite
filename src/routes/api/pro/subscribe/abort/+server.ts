import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { readJsonBody } from '$lib/dontcode/cookies'
import { abortSubscription } from '$lib/Pro/subscription.server'

/**
 * Split-flow cleanup: release a reserved subscription whose PortOne popup was
 * dismissed or failed, so it does not linger as a half-open reservation.
 * Best-effort — the caller does not depend on the result.
 */
export const POST = async ({ locals, request }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	const body = await readJsonBody(request)
	const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId : ''
	if (!subscriptionId) return json({ status: 'ignored' })

	try {
		await abortSubscription(subscriptionId)
	} catch (msg) {
		logToErrorDb(msg)
	}
	return json({ status: 'ok' })
}
