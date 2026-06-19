/**
 * DESTRUCTIVE dev helper: drop every app table, then re-apply the schema.
 *
 *   pnpm db:reset                       # targets .env.local
 *   pnpm db:reset .env.scratch.local    # targets another project
 *   pnpm db:reset --force               # skip the confirmation prompt (CI)
 *
 * A CLI has no SvelteKit `dev` flag — the only thing deciding which database is
 * wiped is the creds you load. Point this at a SEPARATE DontCode dev project,
 * never prod. As a backstop it prints the target host + masked key and makes
 * you type the host to confirm (use --force only when you're certain).
 */
import { createInterface } from 'node:readline/promises'
import { isDontCodeError } from '@dontcode2/backend'
import { consolidatedSchema, dropAllTablesSql } from '../src/lib/Migrations/list'
import { loadEnv, makeClient } from './_dontcode'

const args = process.argv.slice(2)
const force = args.includes('--force')
const envArg = args.find((a) => !a.startsWith('--'))

loadEnv(envArg)
const { client, host, keyHint } = makeClient()

console.warn('\n⚠️  RESET will DROP ALL app tables, then recreate the schema, on:')
console.warn(`      host:    ${host}`)
console.warn(`      project: ${keyHint}`)
console.warn('    This is irreversible.\n')

if (!force) {
	if (!process.stdin.isTTY) {
		console.error('Refusing to reset non-interactively. Re-run with --force if you are sure.')
		process.exit(1)
	}
	const rl = createInterface({ input: process.stdin, output: process.stdout })
	const answer = await rl.question(`Type the host (${host}) to confirm: `)
	rl.close()
	if (answer.trim() !== host) {
		console.error('Confirmation did not match. Aborting.')
		process.exit(1)
	}
}

try {
	console.log('Dropping tables …')
	const drop = await client.db.migrate({ sql: dropAllTablesSql })
	if (!drop.success) throw new Error(drop.error ?? 'drop failed')

	console.log('Recreating schema …')
	const up = await client.db.migrate({ sql: consolidatedSchema })
	if (!up.success) throw new Error(up.error ?? 'migrate failed')

	console.log(`✓ Reset complete (tables dropped, ${up.executedStatements ?? '?'} statements applied).`)
	for (const warning of up.warnings ?? []) console.warn('  warning:', warning)
} catch (err) {
	if (isDontCodeError(err)) {
		console.error(`✗ Gateway error ${err.status}:`, err.body?.error ?? err.message)
	} else {
		console.error('✗ Reset failed:', err)
	}
	process.exit(1)
}
