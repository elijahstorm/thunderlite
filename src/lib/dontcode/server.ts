/**
 * DontCode platform client (server-only).
 *
 * ThunderLite is a "bring your own code" app on the DontCode developer
 * platform: auth, database, and file storage are DontCode services reached
 * over HTTP with this project's private API key. How those services work
 * internally is not our concern — we only depend on the public contract.
 *
 * This module is a thin adapter over the official `dontcode` SDK
 * (see https://backend.dontcode.co/en/docs/byoc). The SDK speaks the v1
 * gateway directly, so we no longer hand-roll fetch calls; this file only
 * shapes the SDK's API into the call sites the rest of the app already uses
 * (e.g. `db.find(table, opts)` and the `insertIgnoreConflict`/`upsert`
 * idempotency helpers, which sit on top of the SDK's primitives).
 *
 * Since SDK 0.2.3 the platform also provides a KV cache (`kv`) and realtime
 * pub/sub (`realtime`), both exposed below. Neither is served by the local
 * mock gateway (`pnpm mock`) yet — against the mock, cache reads come back as
 * misses and realtime calls fail; callers are expected to degrade gracefully
 * (defaults for KV-backed config, HTTP polling for game sync).
 *
 * Every call below is wrapped in `metered(namespace, …)` so the gateway ledger
 * can account for it (see Security/gatewayLedger.ts). The gateway budgets each
 * namespace per project per minute, so what a feature COSTS in calls matters as
 * much as how fast any one of them returns — and this adapter is the only place
 * that sees all of them. Database reads and writes are separate budgets (900 and
 * 300 a minute) behind one endpoint, so the direction is named here too: this
 * file is the only place that still knows which one a call is, since the URL
 * does not say. `payments` is deliberately not metered: it never runs
 * on a gameplay path, and wrapping its pass-through helpers would add noise to
 * the one file that has to stay readable as the whole platform surface.
 *
 * Env:
 *   DONTCODE_API_URL  — base URL of the DontCode backend (no trailing slash)
 *   DONTCODE_API_KEY  — this project's API key (dc_…)
 */
import { env } from '$env/dynamic/private'
import { currentGatewayScope, metered } from '$lib/Security/gatewayLedger'
import { noteRateLimitStatus } from '$lib/Security/rateLimit'
import {
	dontcode,
	isDontCodeError,
	type DontCodeClient,
	type BillingPlan,
	type PaymentMethod,
	type PaymentReceipt,
	type ReserveSubscriptionResult,
	type SendEmailInput,
	type SendEmailResult,
	type Subscription,
	type SubscriptionStatus,
} from 'dontcode'

export { DontCodeError, isDontCodeError } from 'dontcode'
export type {
	BillingPlan,
	PaymentMethod,
	PaymentReceipt,
	ReserveSubscriptionResult,
	Subscription,
	SubscriptionStatus,
} from 'dontcode'

/** Lazily-built singleton client — env is validated on first use, not import. */
let _client: DontCodeClient | undefined
function client(): DontCodeClient {
	if (_client) return _client
	const baseUrl = env.DONTCODE_API_URL
	if (!baseUrl) throw new Error('DONTCODE_API_URL is not set')
	const apiKey = env.DONTCODE_API_KEY
	if (!apiKey) throw new Error('DONTCODE_API_KEY is not set')
	_client = dontcode({
		baseUrl: baseUrl.replace(/\/$/, ''),
		apiKey,
		// Every counted response — successes included — reports what is left of
		// that namespace's budget. Feeding it straight into the app's budget
		// tracker is what lets optional work ease off before it gets refused,
		// rather than discovering the ceiling by hitting it. See rateLimit.ts.
		// The second argument is the budget the in-flight call is drawing on, and
		// it is a fallback: the gateway names the budget it counted in
		// `RateLimit-Scope` and the SDK prefers that header. It matters for the
		// responses that carry no scope, where `db` alone cannot say which of the
		// database's two budgets the numbers describe — the ledger's scope can.
		onRateLimit: (status) => noteRateLimitStatus(status, currentGatewayScope()),
	})
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

/**
 * Reads and writes draw on separate budgets — `db/read` at 900 a minute,
 * `db/write` at 300 — even though both go to the same endpoint. Queries count
 * against the first, mutations against the second, and nothing in the request
 * URL distinguishes them, so this is where the distinction has to be made. Pace
 * them independently: a poll loop that exhausts its own budget leaves writes
 * untouched, and treating "the database" as one number gives that back.
 */
export const db = {
	find<T = Record<string, unknown>>(table: string, options: FindOptions = {}): Promise<T[]> {
		return metered('db/read', () => client().db(table).find<T>(options))
	},

	findOne<T = Record<string, unknown>>(
		table: string,
		options: Omit<FindOptions, 'limit' | 'offset'> = {}
	): Promise<T | null> {
		return metered('db/read', () => client().db(table).findOne<T>(options))
	},

	insert(table: string, data: Record<string, unknown>): Promise<{ id: unknown }> {
		return metered('db/write', () => client().db(table).insert(data))
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
		return metered('db/write', () => client().db(table).update({ where, data }))
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
		return metered('db/write', () => client().db(table).delete({ where }))
	},

	count(table: string, where?: Where): Promise<number> {
		return metered('db/read', () =>
			client()
				.db(table)
				.count(where ? { where } : undefined)
		)
	},
}

export type DontCodeDb = typeof db

/** Apply a schema migration (validated server-side). */
export async function migrate(
	sql: string
): Promise<{ success: boolean; executedStatements?: number; warnings?: string[]; error?: string }> {
	return metered('db/migrate', () => client().db.migrate({ sql }))
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
		return (await metered('auth', call)) as AuthResponse
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
			const { user } = await metered('auth', () => client().auth.me({ accessToken }))
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
		await metered('storage', () => client().storage.public.upload(path, data, contentType))
		const { url } = await metered('storage', () => client().storage.public.getUrl(path))
		return { key: path, url }
	},

	/** Delete files from the project's public storage. */
	removePublic(paths: string[]): Promise<{ deleted: number }> {
		return metered('storage', () => client().storage.public.remove(paths))
	},

	/**
	 * Upload into the project's PRIVATE storage: no URL, readable only through
	 * this server. One metered call, unlike `uploadPublic`, which also fetches
	 * the URL. Used for per-match diagnostic traces, which expose both sides'
	 * fog and must never be a link.
	 */
	uploadPrivate(
		path: string,
		data: Blob | Uint8Array | string,
		contentType: string
	): Promise<void> {
		return metered('storage', async () => {
			await client().storage.private.upload(path, data, contentType)
		})
	},

	/** Read a private object back as text, or null if it is not there. */
	downloadPrivate(path: string): Promise<string | null> {
		return metered('storage', async () => {
			try {
				const { body } = await client().storage.private.download(path)
				return Buffer.from(body, 'base64').toString('utf8')
			} catch (msg) {
				if (isDontCodeError(msg) && msg.status === 404) return null
				throw msg
			}
		})
	},
}

// ── KV cache ────────────────────────────────────────────────────────────────
// Ephemeral key-value state with optional TTL expiry. Keys are namespaced to
// this project by the gateway. This is a cache, not a database: values may be
// evicted and are not durable, so anything that must survive belongs in `db`.
// A miss reads back as `null` (`get`/`hgetAll`) or `[]` (`sMembers`).

export interface KvSetOptions {
	/** Time-to-live in seconds. Omit for no expiry. */
	ttl?: number
	/** Only set if the key does not already exist (atomic lock/claim). */
	nx?: boolean
}

export const kv = {
	get<T = unknown>(key: string): Promise<T | null> {
		return metered('cache', () => client().cache.get<T>(key))
	},

	/** Returns `false` when `nx` is set and the key already existed. */
	set(key: string, value: unknown, options: KvSetOptions = {}): Promise<boolean> {
		return metered('cache', () => client().cache.set(key, value, options))
	},

	del(key: string): Promise<boolean> {
		return metered('cache', () => client().cache.del(key))
	},

	/** Set or clear (`null`) the TTL on an existing key. `false` if absent. */
	expire(key: string, ttl: number | null): Promise<boolean> {
		return metered('cache', () => client().cache.expire(key, ttl))
	},

	hset(key: string, fields: Record<string, unknown>): Promise<number> {
		return metered('cache', () => client().cache.hset(key, fields))
	},

	hgetAll<T = Record<string, unknown>>(key: string): Promise<T | null> {
		return metered('cache', () => client().cache.hgetAll<T>(key))
	},

	sAdd(key: string, ...members: string[]): Promise<number> {
		return metered('cache', () => client().cache.sAdd(key, ...members))
	},

	sMembers(key: string): Promise<string[]> {
		return metered('cache', () => client().cache.sMembers(key))
	},

	sRem(key: string, ...members: string[]): Promise<number> {
		return metered('cache', () => client().cache.sRem(key, ...members))
	},
}

// ── Realtime ────────────────────────────────────────────────────────────────
// Server-side control plane for realtime pub/sub. The browser never holds the
// project API key: we mint a short-lived, channel-scoped connection token here
// (see /api/realtime) and the browser opens the WebSocket itself with it.
// Delivery is fire-and-forget — no history/replay — so the game event log in
// `db` stays the source of truth and clients reconcile by polling it.

export interface RealtimeToken {
	token: string
	/** WebSocket URL; the browser connects to `${url}?token=${token}`. */
	url: string
}

export const realtime = {
	/** Mint a connection token scoped to `channels` for one browser session. */
	mintToken(input: {
		channels: string[]
		identity?: string
		ttl?: number
	}): Promise<RealtimeToken> {
		return metered('realtime', () => client().realtime.mintToken(input))
	},

	/** Publish to a channel. Returns how many subscribers it reached. */
	publish(channel: string, payload: unknown): Promise<number> {
		return metered('realtime', () => client().realtime.publish(channel, payload))
	},

	/**
	 * Publish where delivery is best-effort and the caller must not fail with
	 * it (e.g. after a move is durably recorded — subscribers reconcile via
	 * polling if the push never lands). Resolves once the attempt settles so
	 * serverless runtimes don't cut off an in-flight request.
	 */
	async tryPublish(channel: string, payload: unknown): Promise<void> {
		try {
			await metered('realtime', () => client().realtime.publish(channel, payload))
		} catch {
			// Swallowed by design: the mock gateway has no realtime, and a
			// hosted-gateway hiccup only delays sync until the next poll.
		}
	},

	/** Who is currently connected to a channel. */
	presence(channel: string): Promise<{ id: string; identity?: string }[]> {
		return metered('realtime', () => client().realtime.presence(channel))
	},
}

// ── Payments ──────────────────────────────────────────────────────────────
// Server control plane over `/api/v1/payments`. The DontCode gateway settles
// the charge through PortOne and runs recurring renewals itself — the app
// never holds card data or a scheduler. We reserve a subscription, the browser
// issues a billing key in the provider popup, we confirm it, and thereafter we
// only *read* whether the subscription is live and entitled. The acting user is
// the DontCode user id (`locals.user`), passed explicitly. Never call from the
// browser: these carry the project API key.

/**
 * Popup config for a one-shot charge. Mirrors the SDK's `RequestPaymentResult`;
 * defined locally because the installed SDK (0.2.7) predates it — swap to the
 * SDK export once `dontcode` >= 0.2.8 is installed.
 */
export interface RequestPaymentResult {
	paymentId: string
	storeId: string
	channelKey: string
	currency: string
}

type RequestPaymentFn = (params: {
	amount: number
	itemName: string
	method: PaymentMethod
	currency?: string
}) => Promise<RequestPaymentResult>

/** `payments.requestPayment` shipped in SDK 0.2.8; older installs lack it. */
const requestPaymentFn = (): RequestPaymentFn | undefined => {
	const api = client().payments as unknown as { requestPayment?: RequestPaymentFn }
	return typeof api.requestPayment === 'function' ? api.requestPayment.bind(api) : undefined
}

export const payments = {
	/** Whether the installed SDK supports one-shot charges (needs dontcode >= 0.2.8). */
	supportsOneTimePayments(): boolean {
		return requestPaymentFn() !== undefined
	},

	/**
	 * One-shot charge, step 1: create a payment intent and get the popup config.
	 * The gateway owns the provider relationship — the app never configures
	 * PortOne itself, exactly like the subscription reserve step.
	 */
	requestPayment(params: {
		amount: number
		itemName: string
		method: PaymentMethod
		currency?: string
	}): Promise<RequestPaymentResult> {
		const fn = requestPaymentFn()
		if (!fn) throw new Error('One-time payments need dontcode >= 0.2.8')
		return fn(params)
	},

	/** Verify and record a one-shot charge the customer just completed in the popup. */
	verify(params: {
		paymentId: string
		expectedAmount: number
		currency: string
		description?: string
		userId?: string
	}): Promise<PaymentReceipt> {
		return client().payments.verify(params)
	},

	/** Split flow step 1: reserve a subscription and get the popup config. */
	reserveSubscription(params: {
		plan: BillingPlan
		userId: string
		method: PaymentMethod
	}): Promise<ReserveSubscriptionResult> {
		return client().payments.reserveSubscription(params)
	},

	/** Split flow step 2: persist the browser-issued billing key and activate. */
	confirmSubscription(params: {
		subscriptionId: string
		billingKey: string
	}): Promise<Subscription> {
		return client().payments.confirmSubscription(params)
	},

	/** Split flow: release a reserved subscription whose popup was dismissed. */
	abortSubscription(subscriptionId: string): Promise<void> {
		return client().payments.abortSubscription({ subscriptionId })
	},

	/** The first live subscription for a user, or null. */
	getSubscription(userId: string): Promise<Subscription | null> {
		return client().payments.getSubscription(userId)
	},

	/** Authoritative "is this user Pro right now" check. */
	hasActiveSubscription(userId: string, planId?: string): Promise<boolean> {
		return client().payments.hasActiveSubscription(userId, planId)
	},

	/** Whether the user's active subscriptions grant `featureKey`. */
	hasFeature(userId: string, featureKey: string): Promise<boolean> {
		return client().payments.hasFeature(userId, featureKey)
	},

	/** Soft cancel (access through period end) by default. */
	cancelSubscription(
		subscription: Subscription,
		options?: { atPeriodEnd?: boolean }
	): Promise<Subscription> {
		return client().payments.cancelSubscription(subscription, options)
	},

	/** Manually transition status — used to undo a pending cancellation. */
	updateSubscriptionStatus(
		subscription: Subscription,
		status: SubscriptionStatus
	): Promise<Subscription> {
		return client().payments.updateSubscriptionStatus(subscription, status)
	},

	/** Register / upsert the project's plan + feature catalog (seed script). */
	definePlans: (
		...args: Parameters<DontCodeClient['payments']['definePlans']>
	): ReturnType<DontCodeClient['payments']['definePlans']> =>
		client().payments.definePlans(...args),
	defineFeatures: (
		...args: Parameters<DontCodeClient['payments']['defineFeatures']>
	): ReturnType<DontCodeClient['payments']['defineFeatures']> =>
		client().payments.defineFeatures(...args),
	setPlanFeatures: (
		...args: Parameters<DontCodeClient['payments']['setPlanFeatures']>
	): ReturnType<DontCodeClient['payments']['setPlanFeatures']> =>
		client().payments.setPlanFeatures(...args),
	listPlans: (
		...args: Parameters<DontCodeClient['payments']['listPlans']>
	): ReturnType<DontCodeClient['payments']['listPlans']> => client().payments.listPlans(...args),
}

// ── Notifications ─────────────────────────────────────────────────────────
// Transactional email over `/api/v1/notifications`. Content is GitHub-flavored
// Markdown (`markdownText`) — there is no template system. The mock gateway
// (`pnpm mock`) logs sends without delivering, so this is safe to exercise
// locally. Higher-level dedup, preferences, and templating live in
// `$lib/Notifications/email.server`.

export const notifications = {
	/** Send one transactional email. Check `.success` before assuming delivery. */
	sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
		return metered('notifications', () => client().notifications.email.send(input))
	},
}
