/**
 * Server-side Pro subscription ledger. Reads and mutates the `subscriptions`
 * table through the DontCode `db` adapter. The DontCode platform has no billing
 * service, so there is no external payment provider to reconcile against — the
 * row here is the whole truth. Everything is "test mode": activating a
 * subscription records a period but never charges a card.
 */
import { db } from '$lib/dontcode/server'
import { PLANS, type PlanId, type SubscriptionStatus, type SubscriptionView } from './plans'

export type { SubscriptionView } from './plans'

export interface Subscription {
	user_auth: string
	plan: PlanId
	status: SubscriptionStatus
	provider: string
	price_cents: number
	interval: 'month' | 'year'
	started_at: string
	current_period_end: string | null
	cancel_at_period_end: boolean
	canceled_at: string | null
	updated_at: string
}

const nowIso = () => new Date().toISOString()

const periodEnd = (interval: 'month' | 'year'): string => {
	const end = new Date()
	if (interval === 'year') end.setFullYear(end.getFullYear() + 1)
	else end.setMonth(end.getMonth() + 1)
	return end.toISOString()
}

export async function getSubscription(userAuth: string): Promise<Subscription | null> {
	return db.findOne<Subscription>('subscriptions', { where: { user_auth: userAuth } })
}

/** Whether a subscription grants Pro right now (active, or canceled-but-not-lapsed). */
export function subscriptionIsPro(sub: Subscription | null): boolean {
	if (!sub) return false
	if (sub.status === 'active') return true
	// Canceled: still Pro until the paid period runs out.
	if (sub.current_period_end) return new Date(sub.current_period_end).getTime() > Date.now()
	return false
}

export function toView(sub: Subscription | null): SubscriptionView | null {
	if (!sub) return null
	return {
		plan: sub.plan,
		status: sub.status,
		priceCents: sub.price_cents,
		interval: sub.interval,
		currentPeriodEnd: sub.current_period_end,
		cancelAtPeriodEnd: sub.cancel_at_period_end,
		isPro: subscriptionIsPro(sub),
	}
}

/**
 * Start (or restart) a subscription on `planId`. Idempotent per user: a second
 * call overwrites the existing row, which also covers re-subscribing after a
 * cancellation. Returns the resulting subscription.
 */
export async function activateSubscription(
	userAuth: string,
	planId: PlanId
): Promise<Subscription> {
	const plan = PLANS[planId]
	const now = nowIso()
	const record = {
		user_auth: userAuth,
		plan: plan.id,
		status: 'active' as const,
		provider: 'test',
		price_cents: plan.priceCents,
		interval: plan.interval,
		started_at: now,
		current_period_end: periodEnd(plan.interval),
		cancel_at_period_end: false,
		canceled_at: null,
		updated_at: now,
	}
	await db.upsert('subscriptions', { user_auth: userAuth }, record)
	return record as Subscription
}

/**
 * Cancel at period end: the user keeps Pro until `current_period_end`, then it
 * lapses. Marks the row canceled and stamps `canceled_at`. No-op if there is no
 * subscription. Returns the updated view (or null if nothing to cancel).
 */
export async function cancelSubscription(userAuth: string): Promise<Subscription | null> {
	const existing = await getSubscription(userAuth)
	if (!existing) return null
	const now = nowIso()
	await db.update(
		'subscriptions',
		{ user_auth: userAuth },
		{ status: 'canceled', cancel_at_period_end: true, canceled_at: now, updated_at: now }
	)
	return { ...existing, status: 'canceled', cancel_at_period_end: true, canceled_at: now }
}

/** Undo a pending cancellation — flip an active-but-canceling sub back to active. */
export async function resumeSubscription(userAuth: string): Promise<Subscription | null> {
	const existing = await getSubscription(userAuth)
	if (!existing) return null
	const now = nowIso()
	await db.update(
		'subscriptions',
		{ user_auth: userAuth },
		{ status: 'active', cancel_at_period_end: false, canceled_at: null, updated_at: now }
	)
	return { ...existing, status: 'active', cancel_at_period_end: false, canceled_at: null }
}
