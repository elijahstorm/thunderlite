/**
 * Apply the consolidated DB schema to a DontCode project — the safe, idempotent
 * path (`create table if not exists`). Run it as your deploy step or by hand.
 *
 *   vercel env pull .env.production.local      # fetch prod DONTCODE_* creds
 *   pnpm migrate .env.production.local          # apply to prod
 *   pnpm migrate                                # defaults to .env.local
 *   pnpm migrate -                              # use ambient env (CI)
 *
 * No HTTP surface, no mutating GET, no `dev`-flag landmine — see ./_dontcode.ts.
 */
import { isDontCodeError } from '@dontcode2/backend'
import { consolidatedSchema } from '../src/lib/Migrations/list'
import { loadEnv, makeClient } from './_dontcode'

loadEnv(process.argv[2])
const { client, host } = makeClient()

console.log(`Applying schema to ${host} …`)

try {
	const result = await client.db.migrate({ sql: consolidatedSchema })

	if (!result.success) {
		console.error('✗ Migration reported failure:', result.error ?? '(no message)')
		process.exit(1)
	}

	console.log(`✓ Migration applied (executedStatements=${result.executedStatements ?? '?'}).`)
	for (const warning of result.warnings ?? []) console.warn('  warning:', warning)
} catch (err) {
	if (isDontCodeError(err)) {
		console.error(`✗ Gateway error ${err.status}:`, err.body?.error ?? err.message)
	} else {
		console.error('✗ Migration failed:', err)
	}
	process.exit(1)
}
