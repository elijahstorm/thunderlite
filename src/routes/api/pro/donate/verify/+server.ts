import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { readJsonBody } from '$lib/dontcode/cookies'
import { formatPrice, isPaymentMethod, isValidDonationCents } from '$lib/Pro/plans'
import { donationsEnabled, verifyDonation } from '$lib/Pro/donations.server'
import { dontCodeCheckoutPayload } from '$lib/Pro/checkoutError'
import { notify } from '$lib/Notifications/email.server'
import { donationThanks } from '$lib/Notifications/templates'

/**
 * Donation step 2: after the popup settles, ask the gateway to verify the
 * charge with PortOne. The expected amount is recomputed server-side from the
 * USD amount + method, so a client can only "claim" what was actually paid.
 * Idempotent per paymentId on the gateway side.
 */
export const POST = async ({ locals, request }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')
	if (!donationsEnabled()) throw error(503, 'Donations are not available yet')

	const body = await readJsonBody(request)
	const { paymentId, amountCents, method } = body
	// The gateway mints the paymentId (no app-known prefix); verification against
	// the provider's settled amount is what authenticates the claim.
	if (typeof paymentId !== 'string' || !paymentId) throw error(400, 'Unknown payment')
	if (!isValidDonationCents(amountCents)) throw error(400, 'Invalid donation amount')
	if (!isPaymentMethod(method)) throw error(400, 'Unknown payment method')

	try {
		const receipt = await verifyDonation(userAuth, paymentId, amountCents, method)

		// Thank-you note. Deduped per payment so a retried verify sends once.
		await notify({
			userAuth,
			category: 'subscription',
			dedupKey: `donation:${paymentId}`,
			email: locals.userEmail,
			content: donationThanks(formatPrice(amountCents)),
		})

		return json({ status: 'ok', receipt })
	} catch (err) {
		const forwarded = dontCodeCheckoutPayload(err)
		if (forwarded) {
			logToErrorDb(err)
			return json(forwarded.body, { status: forwarded.status })
		}
		logToErrorDb(err)
		throw error(500, 'Could not verify the donation')
	}
}
