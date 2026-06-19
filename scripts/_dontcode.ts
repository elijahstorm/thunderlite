/**
 * Shared bootstrap for the DB CLI scripts (migrate / reset).
 *
 * DontCode exposes no direct DB access — schema DDL only enters through the
 * SDK's `db.migrate()` over the authed gateway. These scripts run that from
 * your machine / CI instead of from an HTTP route, which is the mechanism the
 * BYOC docs assume ("apply the app's schema via the migrate endpoint" — gated,
 * not exposed to end users). A CLI has no SvelteKit `dev` flag: the ONLY thing
 * deciding which database is touched is the creds you load here, so point dev
 * runs at a separate DontCode dev project.
 */
import { dontcode, type DontCodeClient } from '@dontcode2/backend'

/**
 * Load DONTCODE_* from an env file into `process.env`. Defaults to `.env.local`;
 * pass a path (e.g. `.env.production.local`) to target another project, or `-`
 * to skip file loading and use the ambient environment (CI).
 */
export function loadEnv(envArg?: string): void {
	if (envArg === '-') return
	const envFile = envArg ?? '.env.local'
	try {
		process.loadEnvFile(envFile)
		console.log(`Loaded env from ${envFile}`)
	} catch {
		console.log(`No env file at ${envFile}; using the ambient environment.`)
	}
}

export interface CliClient {
	client: DontCodeClient
	/** Gateway host, shown in confirmations. */
	host: string
	/** Masked API key, so you can eyeball which project you're about to hit. */
	keyHint: string
}

/** Build the SDK client from the environment, or exit(1) with guidance. */
export function makeClient(): CliClient {
	const baseUrl = process.env.DONTCODE_API_URL
	const apiKey = process.env.DONTCODE_API_KEY
	if (!baseUrl || !apiKey) {
		console.error(
			'Missing DONTCODE_API_URL / DONTCODE_API_KEY.\n' +
				'Pull them (`vercel env pull .env.local`) or pass an env file, e.g.\n' +
				'  pnpm migrate .env.production.local'
		)
		process.exit(1)
	}
	return {
		client: dontcode({ baseUrl: baseUrl.replace(/\/$/, ''), apiKey }),
		host: new URL(baseUrl).host,
		keyHint: `${apiKey.slice(0, 5)}…${apiKey.slice(-3)}`,
	}
}
