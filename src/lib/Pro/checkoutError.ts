import { isDontCodeError } from '@dontcode2/backend'

/**
 * Shape returned to the browser when a checkout step fails with a DontCode
 * gateway error. `message` is the gateway's human-readable reason (already
 * localized copy that is safe to show a buyer), and `code` is the stable
 * machine code to branch on (e.g. `BANK_ACCOUNT_REQUIRED`).
 */
export interface CheckoutErrorBody {
	status: 'error'
	code: string | null
	message: string
}

/**
 * Map a checkout failure to an HTTP-safe status + user-facing body, but only
 * for errors the DontCode payments gateway raised. Those carry an actionable
 * reason we want the buyer to see verbatim — most notably 402
 * `BANK_ACCOUNT_REQUIRED`, which means the project has no verified payout bank
 * account yet, so the fix is on the app owner's side, not the buyer's.
 *
 * Returns `null` for anything that is not a gateway error, so callers keep
 * collapsing unexpected internal failures into a generic 500 (never leaking an
 * arbitrary stack or message to the buyer). Transport failures surface on
 * DontCodeError with a non-HTTP status (0 for network, 408 for timeout); a
 * status outside the HTTP error range is normalized to 502 so the response is
 * always a valid gateway error.
 */
export function dontCodeCheckoutPayload(
	err: unknown
): { status: number; body: CheckoutErrorBody } | null {
	if (!isDontCodeError(err)) return null
	const status = err.status >= 400 && err.status <= 599 ? err.status : 502
	return {
		status,
		body: { status: 'error', code: err.code ?? null, message: err.message },
	}
}
