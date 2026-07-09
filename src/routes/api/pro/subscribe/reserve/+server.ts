import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { readJsonBody } from '$lib/dontcode/cookies'
import { isPlanId, isPaymentMethod } from '$lib/Pro/plans'
import { reserveSubscription } from '$lib/Pro/subscription.server'
import { dontCodeCheckoutPayload } from '$lib/Pro/checkoutError'
import { rememberEmail } from '$lib/Notifications/email.server'

/**
 * Split-flow step 1: reserve a ThunderLite Pro subscription. Returns the PortOne
 * popup config (store id, channel key, billing-key method) the browser needs to
 * issue a billing key. No charge happens here; the gateway settles once the
 * confirm step lands the billing key.
 */
export const POST = async ({ locals, request }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	const body = await readJsonBody(request)
	const { plan, method } = body
	if (!isPlanId(plan)) throw error(400, 'Unknown plan')
	if (!isPaymentMethod(method)) throw error(400, 'Unknown payment method')

	// Opportunistically cache the account email so future notifications reach them.
	await rememberEmail(userAuth, locals.userEmail)

	try {
		const reservation = await reserveSubscription(userAuth, plan, method)
		return json({ status: 'ok', reservation })
	} catch (err) {
		logToErrorDb(err)
		// The gateway surfaces actionable reasons (e.g. 402 BANK_ACCOUNT_REQUIRED
		// when the project has no verified payout account). Forward its status +
		// message so the buyer sees why, instead of a blanket 500.
		const forwarded = dontCodeCheckoutPayload(err)
		if (forwarded) return json(forwarded.body, { status: forwarded.status })
		throw error(500, 'Could not start checkout')
	}
}
