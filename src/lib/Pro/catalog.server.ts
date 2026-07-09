/**
 * Register the Pro catalog with the DontCode payments gateway at runtime.
 *
 * Going SDK-native, the gateway owns plans, features, and entitlements — there
 * is no local `subscriptions` table any more. `definePlans` / `defineFeatures`
 * are upserts keyed by the stable `plan_id` / `feature_key`, so this is safe to
 * run repeatedly. The registry `amount` is the canonical USD-cent price; the
 * per-charge amount and currency are derived at reserve time from the chosen
 * method (`money.server.ts`).
 *
 * For a plain CLI seed (no `$env`), see `scripts/seed-pro.ts`, which registers
 * the same `catalogData` through a direct client.
 */
import { payments } from '$lib/dontcode/server'
import { catalogPlans, catalogFeatures, planFeatureAssignment } from './catalogData'

/** Register/upsert the Pro plans and features. Idempotent. */
export async function seedProCatalog(): Promise<void> {
	await payments.definePlans(catalogPlans)
	await payments.defineFeatures(catalogFeatures)
	for (const plan of catalogPlans) {
		await payments.setPlanFeatures(plan.plan_id, planFeatureAssignment)
	}
}
