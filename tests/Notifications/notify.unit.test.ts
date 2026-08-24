// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory `email_log` plus a scriptable gateway. The gateway matters most:
// it reports some failures in-band and raises others, and only one of those two
// paths used to release the dedup claim.
const h = vi.hoisted(() => {
	const rows: Record<string, unknown>[] = []
	const logged: string[] = []
	let send: () => Promise<{ success: boolean; messageId?: string; error?: string }> = async () => ({
		success: true,
		messageId: 'mid-1',
	})
	return {
		rows,
		logged,
		get send() {
			return send
		},
		set send(next) {
			send = next
		},
	}
})

vi.mock('$lib/Security/serverLogs', () => ({
	logToErrorDb: async (e: unknown, info?: string) =>
		void h.logged.push(`${info ? `${info}: ` : ''}${e instanceof Error ? e.message : e}`),
}))

vi.mock('$lib/dontcode/server', () => ({
	db: {
		findOne: async (table: string, options: { where?: Record<string, unknown> }) => {
			if (table === 'profiles') return { email: 'player@example.com' }
			if (table === 'notification_prefs') return null
			return h.rows.find((row) => row.dedup_key === options.where?.dedup_key) ?? null
		},
		insert: async (_table: string, data: Record<string, unknown>) => {
			if (h.rows.some((row) => row.dedup_key === data.dedup_key)) {
				throw Object.assign(new Error('conflict'), { status: 409 })
			}
			h.rows.push({ ...data })
			return { id: h.rows.length }
		},
		insertIgnoreConflict: async (_table: string, data: Record<string, unknown>) => {
			if (h.rows.some((row) => row.dedup_key === data.dedup_key)) return null
			h.rows.push({ ...data })
			return { id: h.rows.length }
		},
		update: async (
			_table: string,
			where: Record<string, unknown>,
			data: Record<string, unknown>
		) => {
			const hits = h.rows.filter((row) => row.dedup_key === where.dedup_key)
			hits.forEach((row) => Object.assign(row, data))
			return { count: hits.length }
		},
		delete: async (_table: string, where: Record<string, unknown>) => {
			const before = h.rows.length
			for (let i = h.rows.length - 1; i >= 0; i -= 1) {
				if (h.rows[i].dedup_key === where.dedup_key) h.rows.splice(i, 1)
			}
			return { count: before - h.rows.length }
		},
	},
	notifications: { sendEmail: () => h.send() },
}))

import { notify } from '../../src/lib/Notifications/email.server'

const input = {
	userAuth: 'them',
	category: 'social' as const,
	dedupKey: 'friend-request:me:them:2026-08-24',
	content: { subject: 'A friend request', markdownText: 'hello' },
}

beforeEach(() => {
	h.rows.length = 0
	h.logged.length = 0
	h.send = async () => ({ success: true, messageId: 'mid-1' })
})

describe('notify', () => {
	it('records a successful send against its dedup key', async () => {
		await notify(input)

		expect(h.rows).toHaveLength(1)
		expect(h.rows[0]).toMatchObject({ success: true, message_id: 'mid-1' })
	})

	it('sends a given event only once', async () => {
		await notify(input)
		await notify(input)

		expect(h.rows).toHaveLength(1)
	})

	it('releases the claim when the gateway reports failure in-band', async () => {
		h.send = async () => ({ success: false, error: 'mailbox full' })

		await notify(input)

		expect(h.rows).toHaveLength(0)
		expect(h.logged.join('\n')).toContain('mailbox full')
	})

	it('releases the claim when the gateway throws', async () => {
		// The real regression: an unavailable / not-yet-enabled notifications
		// service raises instead of returning, which used to skip the release and
		// leave the key claimed at success=false forever. That silenced the event
		// permanently, even once the gateway recovered.
		h.send = async () => {
			throw new Error('This service is temporarily unavailable')
		}

		await notify(input)

		expect(h.rows).toHaveLength(0)
		expect(h.logged.join('\n')).toContain('This service is temporarily unavailable')
	})

	it('retries a previously failed event on the next trigger', async () => {
		h.send = async () => {
			throw new Error('This service is temporarily unavailable')
		}
		await notify(input)

		h.send = async () => ({ success: true, messageId: 'mid-2' })
		await notify(input)

		expect(h.rows).toHaveLength(1)
		expect(h.rows[0]).toMatchObject({ success: true, message_id: 'mid-2' })
	})
})
