/**
 * Currency conversion for ThunderLite Pro billing (server-only).
 *
 * Plan prices are authored once in USD cents (see `plans.ts`) because that is
 * what the UI shows. The DontCode payments gateway settles through PortOne,
 * whose easy-pay providers (KakaoPay, TossPay, NaverPay) are KRW-only while
 * card (and PayPal) can run in USD. So the amount we hand to the gateway
 * depends on the method the user picked, and we convert here.
 *
 * Amount units follow what PortOne expects per currency:
 *   - KRW has no minor unit  → the integer IS whole won.
 *   - USD has cents          → the integer is cents (== our stored priceCents).
 *
 * The USD→KRW rate is a slow-moving constant, overridable without a deploy via
 * `SUBSCRIPTION_USD_TO_KRW`. This is billing display / charge sizing, not a
 * trading desk: a periodically-updated constant is the right amount of
 * precision, and keeping it in one place means one line to change.
 */
import { env } from '$env/dynamic/private'
import type { PaymentMethod } from '$lib/dontcode/server'

/** Fallback USD→KRW rate; override with `SUBSCRIPTION_USD_TO_KRW`. */
const DEFAULT_USD_TO_KRW = 1350

const usdToKrw = (): number => {
	const raw = Number(env.SUBSCRIPTION_USD_TO_KRW)
	return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USD_TO_KRW
}

/**
 * Which currency a method settles in. Easy-pay rails are KRW-only; card and
 * anything else default to USD (the price as authored).
 */
export const currencyFor = (method: PaymentMethod): 'KRW' | 'USD' => {
	switch (method) {
		case 'kakaopay':
		case 'tosspay':
		case 'naverpay':
			return 'KRW'
		case 'card':
		default:
			return 'USD'
	}
}

/**
 * Convert a USD-cent price into the integer amount + currency to charge for a
 * given method. KRW is rounded to whole won; USD passes through as cents.
 */
export const chargeFor = (
	method: PaymentMethod,
	usdCents: number
): { amount: number; currency: 'KRW' | 'USD' } => {
	const currency = currencyFor(method)
	if (currency === 'KRW') {
		const usd = usdCents / 100
		return { amount: Math.round(usd * usdToKrw()), currency }
	}
	return { amount: usdCents, currency }
}
