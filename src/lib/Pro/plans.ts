/**
 * ThunderLite Pro plan catalog — shared by the checkout UI and the server so
 * the price a user sees is the price the server records. Prices are authored in
 * USD cents; the DontCode payments gateway is the source of truth for who is
 * subscribed, and `money.server.ts` converts these to the charge currency for
 * the chosen provider (KRW for the easy-pay rails, USD for card).
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

/** SDK feature keys a Pro subscription grants. Checked with `payments.hasFeature`. */
export const PRO_FEATURES = {
	persistentInventory: 'persistent_inventory',
	unlimitedMaps: 'unlimited_maps',
	priorityMatchmaking: 'priority_matchmaking',
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

export const PERKS = [
	{ icon: 'lucide:package', label: 'Persistent inventory across sessions' },
	{ icon: 'lucide:map', label: 'Unlimited custom maps' },
	{ icon: 'lucide:zap', label: 'Priority match-making' },
	{ icon: 'lucide:heart', label: 'Support indie development' },
]
