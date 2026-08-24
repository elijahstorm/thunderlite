import { error, isHttpError, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { readJsonBody } from '$lib/dontcode/cookies'
import { PLANS } from '$lib/Pro/plans'
import { confirmSubscription } from '$lib/Pro/subscription.server'
import { dontCodeCheckoutPayload } from '$lib/Pro/checkoutError'
import { notify } from '$lib/Notifications/email.server'
import { proActivated } from '$lib/Notifications/templates'

/**
 * Split-flow step 2: confirm a reserved subscription with the billing key the
 * browser just issued in the PortOne popup. Idempotent on the gateway side.
 * On success the subscription is active and we send the welcome email.
 */
export const POST = async ({ locals, request }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')

	const body = await readJsonBody(request)
	const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId : ''
	const billingKey = typeof body.billingKey === 'string' ? body.billingKey : ''
	if (!subscriptionId || !billingKey) throw error(400, 'Missing subscription or billing key')

	try {
		const subscription = await confirmSubscription(subscriptionId, billingKey)
		if (!subscription) throw error(502, 'Subscription could not be activated')

		// Welcome email. Deduped per subscription so a retried confirm sends once.
		await notify({
			userAuth,
			category: 'subscription',
			dedupKey: `pro-activated:${subscriptionId}`,
			email: locals.userEmail,
			content: proActivated(PLANS[subscription.plan].label, subscription.currentPeriodEnd),
		})

		return json({ status: 'ok', subscription })
	} catch (err) {
		// Forward an actionable gateway error (e.g. 402 BANK_ACCOUNT_REQUIRED)
		// before anything else — a DontCodeError also carries a `status`, so it
		// must be handled ahead of the generic HttpError re-throw below.
		const forwarded = dontCodeCheckoutPayload(err)
		if (forwarded) {
			await logToErrorDb(err)
			return json(forwarded.body, { status: forwarded.status })
		}
		if (isHttpError(err)) throw err
		await logToErrorDb(err)
		throw error(500, 'Could not confirm subscription')
	}
}
