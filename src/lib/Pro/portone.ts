/**
 * PortOne billing-key issuance (browser-only).
 *
 * The server reserves a subscription and hands back the store id, channel key,
 * and billing-key method. This opens the PortOne popup so the customer can
 * authorize a recurring billing key; the resulting key goes back to the server
 * to confirm the subscription. Card data never touches our server.
 *
 * Only runs in the browser (PortOne needs `window`). Import lazily from the
 * checkout handler, not at module top level of a server-rendered component.
 */
import PortOne from '@portone/browser-sdk/v2'
import type { ProPaymentMethod } from './plans'

export interface Reservation {
	subscriptionId: string
	storeId: string
	channelKey: string
	billingKeyMethod: 'CARD' | 'EASY_PAY'
}

export type IssueResult = { billingKey: string } | { error: string }

/** Easy-pay rails map onto PortOne's provider codes; card has none. */
const easyPayProviderFor = (method: ProPaymentMethod): string | undefined => {
	switch (method) {
		case 'kakaopay':
			return 'KAKAOPAY'
		case 'tosspay':
			return 'TOSSPAY'
		case 'naverpay':
			return 'NAVERPAY'
		default:
			return undefined
	}
}

/** Open the PortOne popup and resolve to the issued billing key (or an error). */
export async function issueBillingKey(
	reservation: Reservation,
	method: ProPaymentMethod,
	customer?: { email?: string }
): Promise<IssueResult> {
	const easyPayProvider = easyPayProviderFor(method)
	const response = await PortOne.requestIssueBillingKey({
		storeId: reservation.storeId,
		channelKey: reservation.channelKey,
		billingKeyMethod: reservation.billingKeyMethod,
		issueId: `${reservation.subscriptionId}-${Date.now()}`,
		issueName: 'ThunderLite supporter',
		...(customer?.email ? { customer: { email: customer.email } } : {}),
		...(easyPayProvider ? { easyPay: { easyPayProvider } } : {}),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)

	// `undefined` means the customer closed the window before finishing.
	if (!response) return { error: 'Checkout was closed before finishing.' }
	if (response.code) return { error: response.message ?? response.code }
	return { billingKey: response.billingKey }
}

/** Popup config for a one-time donation, as returned by /api/pro/donate/start. */
export interface DonationCheckout {
	paymentId: string
	storeId: string
	channelKey: string
	amount: number
	currency: 'KRW' | 'USD'
}

export type DonationResult = { paymentId: string } | { error: string }

/** Open the PortOne popup for a one-shot charge; the server verifies it after. */
export async function requestDonation(
	checkout: DonationCheckout,
	method: ProPaymentMethod,
	customer?: { email?: string }
): Promise<DonationResult> {
	const easyPayProvider = easyPayProviderFor(method)
	const response = await PortOne.requestPayment({
		storeId: checkout.storeId,
		channelKey: checkout.channelKey,
		paymentId: checkout.paymentId,
		orderName: 'ThunderLite donation',
		totalAmount: checkout.amount,
		currency: checkout.currency,
		payMethod: method === 'card' ? 'CARD' : 'EASY_PAY',
		...(customer?.email ? { customer: { email: customer.email } } : {}),
		...(easyPayProvider ? { easyPay: { easyPayProvider } } : {}),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)

	if (!response) return { error: 'Checkout was closed before finishing.' }
	if (response.code) return { error: response.message ?? response.code }
	return { paymentId: response.paymentId }
}
