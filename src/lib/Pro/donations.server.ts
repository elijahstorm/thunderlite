/**
 * One-time donations, backed by the DontCode payments gateway (server-only).
 *
 * Unlike the supporter subscription (reserve → billing key → confirm), a
 * donation is a single charge: the gateway's `payments.requestPayment` mints a
 * payment intent and returns the popup config (paymentId + storeId/channelKey),
 * the customer pays in the popup, and we then ask the gateway to verify the
 * charge (`payments.verify` checks the real amount with the provider, so a
 * client cannot claim more than it paid).
 *
 * The gateway owns the payment-provider relationship end to end — same as the
 * subscription flow, the app never holds provider credentials or config.
 * `requestPayment` needs SDK >= 0.2.8; on older installs the donate UI hides
 * itself and only recurring support is offered.
 */
import { payments, type PaymentMethod, type PaymentReceipt } from '$lib/dontcode/server'
import { chargeFor } from './money.server'
import type { DonationCheckout } from './portone'

/** One-time donations need `payments.requestPayment` (SDK >= 0.2.8). */
export const donationsEnabled = (): boolean => payments.supportsOneTimePayments()

/** Mint a payment intent for a donation of `usdCents` via `method`; returns the popup config. */
export async function startDonation(
	usdCents: number,
	method: PaymentMethod
): Promise<DonationCheckout> {
	const { amount, currency } = chargeFor(method, usdCents)
	const intent = await payments.requestPayment({
		amount,
		itemName: 'ThunderLite donation',
		method,
		currency,
	})
	return {
		paymentId: intent.paymentId,
		storeId: intent.storeId,
		channelKey: intent.channelKey,
		amount,
		currency,
	}
}

/**
 * Verify a completed donation with the gateway. Recomputes the expected charge
 * from the USD amount + method server-side; the gateway rejects a mismatch
 * against what the provider actually settled. Idempotent per paymentId.
 */
export function verifyDonation(
	userAuth: string,
	paymentId: string,
	usdCents: number,
	method: PaymentMethod
): Promise<PaymentReceipt> {
	const { amount, currency } = chargeFor(method, usdCents)
	return payments.verify({
		paymentId,
		expectedAmount: amount,
		currency,
		description: 'ThunderLite donation',
		userId: userAuth,
	})
}
