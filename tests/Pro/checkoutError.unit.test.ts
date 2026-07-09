// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DontCodeError } from '@dontcode2/backend'
import { dontCodeCheckoutPayload } from '../../src/lib/Pro/checkoutError'

describe('dontCodeCheckoutPayload', () => {
	it('forwards a gateway 402 with its status, code, and message', () => {
		const err = new DontCodeError(402, {
			error: 'This app cannot accept payments yet. The team has not linked a payout bank account.',
			code: 'BANK_ACCOUNT_REQUIRED',
			message_ko: '아직 결제를 받을 수 없습니다.',
		})

		expect(dontCodeCheckoutPayload(err)).toEqual({
			status: 402,
			body: {
				status: 'error',
				code: 'BANK_ACCOUNT_REQUIRED',
				message:
					'This app cannot accept payments yet. The team has not linked a payout bank account.',
			},
		})
	})

	it('normalizes a non-HTTP transport status (network failure, 0) to 502', () => {
		const err = new DontCodeError(0, { error: 'Network request failed', code: 'NetworkError' })

		const payload = dontCodeCheckoutPayload(err)
		expect(payload?.status).toBe(502)
		expect(payload?.body.code).toBe('NetworkError')
	})

	it('preserves a timeout status (408) as-is', () => {
		const err = new DontCodeError(408, { error: 'timed out', code: 'Timeout' })

		expect(dontCodeCheckoutPayload(err)?.status).toBe(408)
	})

	it('reports a null code when the gateway sent no machine code', () => {
		const err = new DontCodeError(409, { error: 'User already has a live subscription' })

		expect(dontCodeCheckoutPayload(err)?.body.code).toBeNull()
	})

	it('returns null for a non-DontCode error so callers fall back to a generic 500', () => {
		expect(dontCodeCheckoutPayload(new Error('boom'))).toBeNull()
		expect(dontCodeCheckoutPayload('boom')).toBeNull()
		expect(dontCodeCheckoutPayload(null)).toBeNull()
	})
})
