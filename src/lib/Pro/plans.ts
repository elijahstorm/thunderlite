/**
 * ThunderLite Pro plan catalog — shared by the checkout UI and the server so
 * the price a user sees is the price the server records. Pro is currently a
 * "test mode" subscription: it exercises the full billing lifecycle but gates
 * no features, so these numbers exist to make the payment flow feel real, not
 * to unlock anything.
 */

export type PlanId = 'monthly' | 'yearly'
export type BillingInterval = 'month' | 'year'

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
