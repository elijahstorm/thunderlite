/**
 * DontCode platform client (server-only).
 *
 * ThunderLite is a "bring your own code" app on the DontCode developer
 * platform: auth, database, and file storage are DontCode services reached
 * over HTTP with this project's private API key. How those services work
 * internally is not our concern — we only depend on the public contract.
 *
 * Env:
 *   DONTCODE_API_URL  — base URL of the DontCode backend (no trailing slash)
 *   DONTCODE_API_KEY  — this project's API key (dc_…)
 */
import { env } from '$env/dynamic/private'

export class DontCodeApiError extends Error {
	constructor(
		public status: number,
		message: string,
		/** Machine-readable error code from the API body (e.g. "EmailNotVerified"). */
		public code?: string
	) {
		super(message)
		this.name = 'DontCodeApiError'
	}

	/** Unique/foreign-key conflicts — used for idempotent insert patterns. */
	get isConflict(): boolean {
		return this.status === 409
	}
}

function baseUrl(): string {
	const url = env.DONTCODE_API_URL
	if (!url) throw new Error('DONTCODE_API_URL is not set')
	return url.replace(/\/$/, '')
}

function apiKey(): string {
	const key = env.DONTCODE_API_KEY
	if (!key) throw new Error('DONTCODE_API_KEY is not set')
	return key
}

async function request<T>(
	path: string,
	init: { method: string; body?: BodyInit; headers?: Record<string, string> }
): Promise<T> {
	const res = await fetch(`${baseUrl()}${path}`, {
		method: init.method,
		headers: {
			Authorization: `Bearer ${apiKey()}`,
			...init.headers,
		},
		body: init.body,
	})

	const payload = await res.json().catch(() => null)
	if (!res.ok) {
		const message =
			payload && typeof payload.error === 'string'
				? payload.error
				: `DontCode API request failed (${res.status})`
		const code = payload && typeof payload.code === 'string' ? payload.code : undefined
		throw new DontCodeApiError(res.status, message, code)
	}
	return payload as T
}

function jsonRequest<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
	return request<T>(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body),
	})
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

async function dbOperation<T>(operation: string, tableName: string, options: object): Promise<T> {
	const result = await jsonRequest<{ data: T }>('/api/v1/db', {
		operation,
		tableName,
		options,
	})
	return result.data
}

export const db = {
	find<T = Record<string, unknown>>(table: string, options: FindOptions = {}): Promise<T[]> {
		return dbOperation<T[]>('find', table, options)
	},

	findOne<T = Record<string, unknown>>(
		table: string,
		options: Omit<FindOptions, 'limit' | 'offset'> = {}
	): Promise<T | null> {
		return dbOperation<T | null>('findOne', table, options)
	},

	insert(table: string, data: Record<string, unknown>): Promise<{ id: unknown }> {
		return dbOperation<{ id: unknown }>('insert', table, { data })
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
			if (err instanceof DontCodeApiError && err.isConflict) return null
			throw err
		}
	},

	update(table: string, where: Where, data: Record<string, unknown>): Promise<{ count: number }> {
		return dbOperation<{ count: number }>('update', table, { where, data })
	},

	/** Update-then-insert. Replaces the old `ON CONFLICT DO UPDATE` patterns. */
	async upsert(table: string, where: Where, data: Record<string, unknown>): Promise<void> {
		const { count } = await db.update(table, where, data)
		if (count > 0) return
		try {
			await db.insert(table, { ...where, ...data })
		} catch (err) {
			// Lost a race with a concurrent insert — the row exists now, update it.
			if (err instanceof DontCodeApiError && err.isConflict) {
				await db.update(table, where, data)
				return
			}
			throw err
		}
	},

	delete(table: string, where: Where): Promise<{ count: number }> {
		return dbOperation<{ count: number }>('delete', table, { where })
	},

	count(table: string, where?: Where): Promise<number> {
		return dbOperation<number>('count', table, where ? { where } : {})
	},
}

export type DontCodeDb = typeof db

/** Apply a schema migration (validated server-side). */
export async function migrate(
	sql: string
): Promise<{ success: boolean; executedStatements: number; warnings: string[] }> {
	return jsonRequest('/api/v1/db/migrate', { sql })
}

// ── Auth ────────────────────────────────────────────────────────────────────

export interface DontCodeUser {
	id: string
	email: string
	role?: string | null
	claims?: Record<string, unknown>
}

interface AuthResponse {
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

async function authPost(endpoint: string, body: unknown, accessToken?: string) {
	return jsonRequest<AuthResponse>(
		`/api/v1/auth/${endpoint}`,
		body,
		accessToken ? { 'X-Access-Token': accessToken } : undefined
	).catch((err) => {
		// Auth endpoints communicate failures in-band ({ success: false }) so
		// callers can show the message instead of crashing the request.
		if (err instanceof DontCodeApiError && err.status < 500) {
			return { success: false, error: err.message, code: err.code } satisfies AuthResponse
		}
		throw err
	})
}

export const auth = {
	signup(email: string, password: string): Promise<AuthResponse> {
		return authPost('signup', { email, password })
	},

	login(email: string, password: string): Promise<AuthResponse> {
		return authPost('login', { email, password })
	},

	/** Confirm a new account with the 6-digit code emailed to the user. */
	verifyEmail(code: string, email?: string): Promise<AuthResponse> {
		return authPost('verify-email', { code, email })
	},

	/**
	 * Complete a login that returned `mfa_required`. Supply the challenge token
	 * from that login plus either an authenticator `code` or a `recoveryCode`.
	 */
	mfaChallenge(
		challengeToken: string,
		{ code, recoveryCode }: { code?: string; recoveryCode?: string }
	): Promise<AuthResponse> {
		return authPost('mfa/challenge', {
			challenge_token: challengeToken,
			code,
			recovery_code: recoveryCode,
		})
	},

	/** Resolve the current user from an access token. Null when invalid/expired. */
	async me(accessToken: string): Promise<DontCodeUser | null> {
		try {
			const result = await jsonRequest<{ user: DontCodeUser | null }>(
				'/api/v1/auth/me',
				{},
				{ 'X-Access-Token': accessToken }
			)
			return result.user
		} catch (err) {
			if (err instanceof DontCodeApiError && err.status === 401) return null
			throw err
		}
	},

	forgotPassword(email: string): Promise<AuthResponse> {
		return authPost('forgot-password', { email })
	},

	resetPassword(code: string, password: string, email?: string): Promise<AuthResponse> {
		return authPost('reset-password', { code, password, email })
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
		const form = new FormData()
		const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: contentType })
		form.append('file', blob, path.split('/').pop() ?? 'file')
		form.append('bucket', 'public')
		form.append('path', path)
		form.append('contentType', contentType)

		await request<{ object: { key: string } }>('/api/v1/storage', {
			method: 'PUT',
			body: form,
		})

		const { url } = await jsonRequest<{ url: string }>('/api/v1/storage', {
			operation: 'getUrl',
			bucket: 'public',
			path,
		})
		return { key: path, url }
	},
}
