/**
 * ThunderLite supporter catalog — shared by the checkout UI and the server so
 * the price a user sees is the price the server records. Prices are authored in
 * USD cents; the DontCode payments gateway is the source of truth for who is
 * subscribed, and `money.server.ts` converts these to the charge currency for
 * the chosen provider (KRW for the easy-pay rails, USD for card).
 *
 * Support is Patreon-style: nothing in the game is paywalled. Recurring
 * "supporter" subscriptions reuse the billing-key flow; one-time donations go
 * through the one-shot PortOne payment + gateway verify (donations.server.ts).
 */

export type PlanId = 'monthly' | 'yearly'
export type BillingInterval = 'month' | 'year'

/**
 * Payment rails the checkout offers. Mirrors the SDK's `PaymentMethod` union;
 * kept here so the client (which must not import server code) can render the
 * picker. `card` settles in USD, the easy-pay rails in KRW.
 */
export type ProPaymentMethod = 'card' | 'kakaopay' | 'tosspay' | 'naverpay'

export const PAYMENT_METHODS: { id: ProPaymentMethod; label: string; icon: string }[] = [
	{ id: 'card', label: 'Card', icon: 'lucide:credit-card' },
	{ id: 'kakaopay', label: 'KakaoPay', icon: 'lucide:message-circle' },
	{ id: 'tosspay', label: 'TossPay', icon: 'lucide:wallet' },
	{ id: 'naverpay', label: 'NaverPay', icon: 'lucide:badge-dollar-sign' },
]

export const isPaymentMethod = (value: unknown): value is ProPaymentMethod =>
	value === 'card' || value === 'kakaopay' || value === 'tosspay' || value === 'naverpay'

/**
 * SDK feature keys a supporter subscription grants. Support is donation-style:
 * the only "feature" is the supporter flag itself (checked with
 * `payments.hasFeature` if the UI ever wants to show a supporter heart).
 * The old gated-perk keys (inventory/maps/matchmaking) were never enforced
 * anywhere and are gone from the catalog.
 */
export const PRO_FEATURES = {
	supporter: 'supporter',
} as const

export interface Plan {
	id: PlanId
	label: string
	priceCents: number
	interval: BillingInterval
	/** Human blurb shown under the price, e.g. "billed yearly". */
	cadence: string
	/** Optional savings badge for the annual plan. */
	badge?: string
}

export const PLANS: Record<PlanId, Plan> = {
	monthly: {
		id: 'monthly',
		label: 'Monthly',
		priceCents: 499,
		interval: 'month',
		cadence: 'billed monthly',
	},
	yearly: {
		id: 'yearly',
		label: 'Yearly',
		priceCents: 4990,
		interval: 'year',
		cadence: 'billed yearly',
		badge: 'Save 17%',
	},
}

export type SubscriptionStatus = 'active' | 'canceled'

/** Public subscription shape handed to the browser (safe to import client-side). */
export interface SubscriptionView {
	plan: PlanId
	status: SubscriptionStatus
	priceCents: number
	interval: BillingInterval
	currentPeriodEnd: string | null
	cancelAtPeriodEnd: boolean
	/** True while the user should be treated as Pro (active, or canceled but not yet lapsed). */
	isPro: boolean
}

export const isPlanId = (value: unknown): value is PlanId =>
	value === 'monthly' || value === 'yearly'

/** `$4.99` from `499`. Cents are dropped only when the amount is whole dollars. */
export const formatPrice = (cents: number): string => {
	const dollars = cents / 100
	return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`
}

/** What donations actually pay for. Honest copy: nothing here is a paywall. */
export const SUPPORT_POINTS = [
	{ icon: 'lucide:server', label: 'Keeps the servers and multiplayer running' },
	{ icon: 'lucide:map', label: 'Funds new units, maps, and campaign chapters' },
	{ icon: 'lucide:lock-open', label: 'No paywalls. Every feature stays free for everyone' },
	{ icon: 'lucide:heart', label: 'Made by one person; every donation genuinely helps' },
]

// ── One-time donations ───────────────────────────────────────────────────────

/** Preset one-time amounts, in USD cents. The custom field allows anything in range. */
export const DONATION_PRESETS_CENTS = [300, 500, 1000, 2500]

/** Bounds for a one-time donation (USD cents): floor for processor minimums, ceiling as a fat-finger guard. */
export const DONATION_MIN_CENTS = 100
export const DONATION_MAX_CENTS = 50000

export const isValidDonationCents = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isInteger(value) &&
	value >= DONATION_MIN_CENTS &&
	value <= DONATION_MAX_CENTS
