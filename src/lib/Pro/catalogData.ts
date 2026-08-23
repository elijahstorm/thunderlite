/**
 * The Pro plan + feature catalog as plain data (no server imports).
 *
 * Shared by the runtime seeder (`catalog.server.ts`, via the SDK facade) and the
 * CLI seed script (`scripts/seed-pro.ts`, via a direct client) so both register
 * exactly the same catalog. Types mirror the SDK's `PlanInput` / `FeatureInput`.
 */
import { PLANS, PRO_FEATURES } from './plans'

export interface CatalogPlan {
	plan_id: string
	name: string
	amount: number
	currency: string
	interval: 'monthly' | 'yearly'
	display_order: number
	active: boolean
}

export interface CatalogFeature {
	feature_key: string
	name: string
	description: string
}

const sdkInterval = (interval: 'month' | 'year'): 'monthly' | 'yearly' =>
	interval === 'year' ? 'yearly' : 'monthly'

/** Plans registered with the gateway. `amount` is the canonical USD-cent price. */
export const catalogPlans: CatalogPlan[] = Object.values(PLANS).map((plan, index) => ({
	plan_id: plan.id,
	name: `ThunderLite Supporter ${plan.label}`,
	amount: plan.priceCents,
	currency: 'USD',
	interval: sdkInterval(plan.interval),
	display_order: index,
	active: true,
}))

/**
 * Support is donation-style: the only feature is the supporter flag itself.
 * The old gated perks (inventory/maps/matchmaking) were removed from the
 * catalog; they were never enforced in game code.
 */
export const catalogFeatures: CatalogFeature[] = [
	{
		feature_key: PRO_FEATURES.supporter,
		name: 'Supporter',
		description: 'Supports ongoing development.',
	},
]

/** Both plans grant the full feature set — Pro is one tier billed two ways. */
export const planFeatureAssignment = catalogFeatures.map((f) => ({ feature_key: f.feature_key }))
