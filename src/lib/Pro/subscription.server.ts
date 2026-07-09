/**
 * Server-side Pro subscription logic, backed by the DontCode payments gateway.
 *
 * The gateway is the source of truth: it settles charges through PortOne and
 * runs recurring renewals itself, so there is no local ledger and no scheduler
 * here. We reserve → confirm a subscription through the split billing-key flow,
 * then only read whether it is live. Everything maps to the app's existing
 * `SubscriptionView` so the dashboard UI is unchanged.
 *
 * The acting user is the DontCode user id (`locals.user`), which is exactly the
 * `userId` the payments API keys subscriptions by.
 */
import {
	payments,
	type BillingPlan,
	type PaymentMethod,
	type ReserveSubscriptionResult,
	type Subscription as SdkSubscription,
} from '$lib/dontcode/server'
import { chargeFor } from './money.server'
import { PLANS, isPlanId, type PlanId, type SubscriptionView } from './plans'

export type { SubscriptionView } from './plans'

const sdkInterval = (interval: 'month' | 'year'): 'monthly' | 'yearly' =>
	interval === 'year' ? 'yearly' : 'monthly'

/** Build the `BillingPlan` for a reservation, converting price to the method's currency. */
function billingPlanFor(planId: PlanId, method: PaymentMethod): BillingPlan {
	const plan = PLANS[planId]
	const { amount, currency } = chargeFor(method, plan.priceCents)
	return {
		id: plan.id,
		name: `ThunderLite Pro ${plan.label}`,
		amount,
		interval: sdkInterval(plan.interval),
		currency,
	}
}

/** A subscription grants Pro while active/trialing, or canceled-but-not-yet-lapsed. */
function isLive(sub: SdkSubscription): boolean {
	if (sub.status === 'active' || sub.status === 'trialing') return true
	// Soft-canceled or past_due: still Pro until the paid period actually ends.
	return new Date(sub.currentPeriodEnd).getTime() > Date.now()
}

/** Map the gateway subscription onto the public view the browser already renders. */
export function toView(sub: SdkSubscription | null): SubscriptionView | null {
	if (!sub) return null
	const planId: PlanId = isPlanId(sub.planId) ? sub.planId : 'monthly'
	const plan = PLANS[planId]
	return {
		plan: planId,
		status: sub.status === 'active' || sub.status === 'trialing' ? 'active' : 'canceled',
		priceCents: plan.priceCents,
		interval: plan.interval,
		currentPeriodEnd: sub.currentPeriodEnd ?? null,
		cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
		isPro: isLive(sub),
	}
}

/** The current subscription view for a user (or null when never subscribed). */
export async function getSubscriptionView(userAuth: string): Promise<SubscriptionView | null> {
	const sub = await payments.getSubscription(userAuth)
	return toView(sub)
}

/** Authoritative Pro gate — use this to unlock features, not the view's `isPro`. */
export function userIsPro(userAuth: string): Promise<boolean> {
	return payments.hasActiveSubscription(userAuth)
}

/**
 * Split flow step 1: reserve a subscription and return the popup config the
 * browser needs to issue a billing key.
 */
export function reserveSubscription(
	userAuth: string,
	planId: PlanId,
	method: PaymentMethod
): Promise<ReserveSubscriptionResult> {
	return payments.reserveSubscription({
		plan: billingPlanFor(planId, method),
		userId: userAuth,
		method,
	})
}

/** Split flow step 2: persist the browser-issued billing key and activate. */
export async function confirmSubscription(
	subscriptionId: string,
	billingKey: string
): Promise<SubscriptionView | null> {
	const sub = await payments.confirmSubscription({ subscriptionId, billingKey })
	return toView(sub)
}

/** Release a reserved subscription whose popup was dismissed. Best-effort. */
export async function abortSubscription(subscriptionId: string): Promise<void> {
	await payments.abortSubscription(subscriptionId)
}

/**
 * Cancel at period end: the user keeps Pro until `currentPeriodEnd`, then it
 * lapses. No-op (returns null) when there is nothing to cancel.
 */
export async function cancelSubscription(userAuth: string): Promise<SubscriptionView | null> {
	const sub = await payments.getSubscription(userAuth)
	if (!sub) return null
	const updated = await payments.cancelSubscription(sub, { atPeriodEnd: true })
	return toView(updated)
}

/** Undo a pending cancellation — flip a canceling subscription back to active. */
export async function resumeSubscription(userAuth: string): Promise<SubscriptionView | null> {
	const sub = await payments.getSubscription(userAuth)
	if (!sub) return null
	const updated = await payments.updateSubscriptionStatus(sub, 'active')
	return toView(updated)
}
