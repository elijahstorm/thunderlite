import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { readJsonBody } from '$lib/dontcode/cookies'
import { isPaymentMethod, isValidDonationCents } from '$lib/Pro/plans'
import { donationsEnabled, startDonation } from '$lib/Pro/donations.server'
import { dontCodeCheckoutPayload } from '$lib/Pro/checkoutError'
import { rememberEmail } from '$lib/Notifications/email.server'

/**
 * Donation step 1: mint a payment intent at the gateway and hand the browser
 * the popup config (paymentId + storeId/channelKey). Nothing is charged here;
 * if the popup is dismissed the paymentId is simply never verified.
 */
export const POST = async ({ locals, request }) => {
	const userAuth = locals.user
	if (!userAuth) throw error(401, 'Not signed in')
	if (!donationsEnabled()) throw error(503, 'Donations are not available yet')

	const body = await readJsonBody(request)
	const { amountCents, method } = body
	if (!isValidDonationCents(amountCents)) throw error(400, 'Invalid donation amount')
	if (!isPaymentMethod(method)) throw error(400, 'Unknown payment method')

	// Opportunistically cache the account email so the thank-you note reaches them.
	await rememberEmail(userAuth, locals.userEmail)

	try {
		const payment = await startDonation(amountCents, method)
		return json({ status: 'ok', payment })
	} catch (err) {
		logToErrorDb(err)
		// Forward actionable gateway reasons (e.g. 402 BANK_ACCOUNT_REQUIRED)
		// so the donor sees why, instead of a blanket 500.
		const forwarded = dontCodeCheckoutPayload(err)
		if (forwarded) return json(forwarded.body, { status: forwarded.status })
		throw error(500, 'Could not start the donation')
	}
}
