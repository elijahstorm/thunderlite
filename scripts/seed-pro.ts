/**
 * Register the ThunderLite Pro plan + feature catalog with a DontCode project.
 *
 *   pnpm migrate                 # tables first
 *   pnpm seed:pro                # then the Pro catalog (defaults to .env.local)
 *   pnpm seed:pro .env.production.local
 *   pnpm seed:pro -              # ambient env (CI)
 *
 * Idempotent: definePlans / defineFeatures are upserts keyed by the stable
 * plan_id / feature_key, so re-running only reconciles.
 */
import { isDontCodeError } from '@dontcode2/backend'
import {
	catalogPlans,
	catalogFeatures,
	planFeatureAssignment,
} from '../src/lib/Pro/catalogData'
import { loadEnv, makeClient } from './_dontcode'

loadEnv(process.argv[2])
const { client, host } = makeClient()

console.log(`Seeding Pro catalog to ${host} …`)

try {
	await client.payments.definePlans(catalogPlans)
	await client.payments.defineFeatures(catalogFeatures)
	for (const plan of catalogPlans) {
		await client.payments.setPlanFeatures(plan.plan_id, planFeatureAssignment)
	}
	console.log(
		`✓ Seeded ${catalogPlans.length} plan(s) and ${catalogFeatures.length} feature(s).`
	)
} catch (err) {
	if (isDontCodeError(err)) {
		console.error(`✗ Gateway error ${err.status}:`, err.body?.error ?? err.message)
	} else {
		console.error('✗ Seed failed:', err)
	}
	process.exit(1)
}
