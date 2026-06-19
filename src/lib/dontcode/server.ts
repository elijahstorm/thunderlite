/**
 * DontCode platform client (server-only).
 *
 * ThunderLite is a "bring your own code" app on the DontCode developer
 * platform: auth, database, and file storage are DontCode services reached
 * over HTTP with this project's private API key. How those services work
 * internally is not our concern — we only depend on the public contract.
 *
 * This module is a thin adapter over the official `@dontcode2/backend` SDK
 * (see https://backend.dontcode.co/en/docs/byoc). The SDK speaks the v1
 * gateway directly, so we no longer hand-roll fetch calls; this file only
 * shapes the SDK's API into the call sites the rest of the app already uses
 * (e.g. `db.find(table, opts)` and the `insertIgnoreConflict`/`upsert`
 * idempotency helpers, which sit on top of the SDK's primitives).
 *
 * Env:
 *   DONTCODE_API_URL  — base URL of the DontCode backend (no trailing slash)
 *   DONTCODE_API_KEY  — this project's API key (dc_…)
 */
import { env } from '$env/dynamic/private'
import { dontcode, isDontCodeError, type DontCodeClient } from '@dontcode2/backend'

export { DontCodeError, isDontCodeError } from '@dontcode2/backend'

/** Lazily-built singleton client — env is validated on first use, not import. */
let _client: DontCodeClient | undefined
function client(): DontCodeClient {
	if (_client) return _client
	const baseUrl = env.DONTCODE_API_URL
	if (!baseUrl) throw new Error('DONTCODE_API_URL is not set')
	const apiKey = env.DONTCODE_API_KEY
	if (!apiKey) throw new Error('DONTCODE_API_KEY is not set')
	_client = dontcode({ baseUrl: baseUrl.replace(/\/$/, ''), apiKey })
	return _client
}

/** True for a unique/foreign-key conflict — the idempotency signal. */
function isConflict(err: unknown): boolean {
	return isDontCodeError(err) && err.status === 409
}

// ── Database ────────────────────────────────────────────────────────────────
// Structured-query protocol. Identifiers are plain [a-zA-Z_][a-zA-Z0-9_]*;
// values are always parameterized server-side.

export type WhereOperator = {
	equals?: unknown
	not?: unknown
	gt?: unknown
	gte?: unknown
	lt?: unknown
	lte?: unknown
	in?: unknown[]
	notIn?: unknown[]
	contains?: string
	startsWith?: string
	endsWith?: string
	mode?: 'default' | 'insensitive'
}

export type Where = {
	[column: string]: unknown
	AND?: Where[]
	OR?: Where[]
	NOT?: Where
}

export interface FindOptions {
	where?: Where
	select?: string[]
	orderBy?: Record<string, 'asc' | 'desc'>
	limit?: number
	offset?: number
}

export const db = {
	find<T = Record<string, unknown>>(table: string, options: FindOptions = {}): Promise<T[]> {
		return client().db(table).find<T>(options)
	},

	findOne<T = Record<string, unknown>>(
		table: string,
		options: Omit<FindOptions, 'limit' | 'offset'> = {}
	): Promise<T | null> {
		return client().db(table).findOne<T>(options)
	},

	insert(table: string, data: Record<string, unknown>): Promise<{ id: unknown }> {
		return client().db(table).insert(data)
	},

	/**
	 * Insert that treats unique-constraint conflicts as success (returns null).
	 * Replaces the old `ON CONFLICT DO NOTHING` patterns.
	 */
	async insertIgnoreConflict(
		table: string,
		data: Record<string, unknown>
	): Promise<{ id: unknown } | null> {
		try {
			return await db.insert(table, data)
		} catch (err) {
			if (isConflict(err)) return null
			throw err
		}
	},

	update(table: string, where: Where, data: Record<string, unknown>): Promise<{ count: number }> {
		return client().db(table).update({ where, data })
	},

	/** Update-then-insert. Replaces the old `ON CONFLICT DO UPDATE` patterns. */
	async upsert(table: string, where: Where, data: Record<string, unknown>): Promise<void> {
		const { count } = await db.update(table, where, data)
		if (count > 0) return
		try {
			await db.insert(table, { ...where, ...data })
		} catch (err) {
			// Lost a race with a concurrent insert — the row exists now, update it.
			if (isConflict(err)) {
				await db.update(table, where, data)
				return
			}
			throw err
		}
	},

	delete(table: string, where: Where): Promise<{ count: number }> {
		return client().db(table).delete({ where })
	},

	count(table: string, where?: Where): Promise<number> {
		return client()
			.db(table)
			.count(where ? { where } : undefined)
	},
}

export type DontCodeDb = typeof db

/** Apply a schema migration (validated server-side). */
export async function migrate(
	sql: string
): Promise<{ success: boolean; executedStatements?: number; warnings?: string[]; error?: string }> {
	return client().db.migrate({ sql })
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface DontCodeUser {
	id: string
	email: string
	role?: string | null
	claims?: Record<string, unknown>
}

/**
 * Superset of the SDK's auth result shapes. The SDK reports actual failures by
 * throwing `DontCodeError`; we convert sub-500 failures back to an in-band
 * `{ success: false, error, code }` so endpoints can render the message
 * instead of crashing the request. "One more step" states
 * (`verification_required`, `mfa_required`) are successes, not errors.
 */
export interface AuthResponse {
	success: boolean
	error?: string
	/** Machine-readable error code, e.g. "EmailNotVerified" / "ChallengeExpired". */
	code?: string
	userId?: string
	message?: string
	tokens?: { AccessToken: string; ExpiresIn: number }
	verified?: boolean
	verification_required?: boolean
	// MFA login challenge (returned by `login` when a second factor is required).
	mfa_offered?: boolean
	mfa_enabled?: boolean
	mfa_required?: boolean
	challenge_token?: string
	challenge_expires_in?: number
}

/** Run an auth call, turning sub-500 gateway errors into in-band failures. */
async function inBand(call: () => Promise<{ success: boolean }>): Promise<AuthResponse> {
	try {
		return (await call()) as AuthResponse
	} catch (err) {
		if (isDontCodeError(err) && err.status < 500) {
			return { success: false, error: err.body.error ?? err.message, code: err.code }
		}
		throw err
	}
}

export const auth = {
	signup(email: string, password: string): Promise<AuthResponse> {
		return inBand(() => client().auth.signup({ email, password }))
	},

	login(email: string, password: string): Promise<AuthResponse> {
		return inBand(() => client().auth.login({ email, password }))
	},

	/** Confirm a new account with the 6-digit code emailed to the user. */
	verifyEmail(code: string, email?: string): Promise<AuthResponse> {
		return inBand(() => client().auth.verifyEmail({ code, email }))
	},

	/**
	 * Complete a login that returned `mfa_required`. Supply the challenge token
	 * from that login plus either an authenticator `code` or a `recoveryCode`.
	 */
	mfaChallenge(
		challengeToken: string,
		{ code, recoveryCode }: { code?: string; recoveryCode?: string }
	): Promise<AuthResponse> {
		return inBand(() => client().auth.mfa.challenge({ challengeToken, code, recoveryCode }))
	},

	/** Resolve the current user from an access token. Null when invalid/expired. */
	async me(accessToken: string): Promise<DontCodeUser | null> {
		try {
			const { user } = await client().auth.me({ accessToken })
			return user
		} catch (err) {
			if (isDontCodeError(err) && err.status === 401) return null
			throw err
		}
	},

	forgotPassword(email: string): Promise<AuthResponse> {
		return inBand(() => client().auth.forgotPassword({ email }))
	},

	resetPassword(code: string, password: string, email?: string): Promise<AuthResponse> {
		return inBand(() => client().auth.resetPassword({ code, password, email }))
	},
}

// ── Storage ─────────────────────────────────────────────────────────────────

export const storage = {
	/** Upload a file into the project's public storage and return its URL. */
	async uploadPublic(
		path: string,
		data: Blob | Uint8Array,
		contentType: string
	): Promise<{ key: string; url: string }> {
		await client().storage.public.upload(path, data, contentType)
		const { url } = await client().storage.public.getUrl(path)
		return { key: path, url }
	},
}
