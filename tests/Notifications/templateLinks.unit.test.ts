// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as t from '$lib/Notifications/templates'

/**
 * Every notification is about something the reader can open. A body with no
 * absolute link back into the app makes them go find it themselves, and a
 * root-relative one resolves against the mail client's own domain, so both
 * failures are worth a test.
 */

const linksIn = (markdown: string): string[] =>
	[...markdown.matchAll(/\]\((?<href>[^)]+)\)/g)].map((m) => m.groups!.href)

// Read the origin back off the footer rather than pinning production, so the
// test still means something on a deploy that sets its own `SITE_URL`.
const ORIGIN = linksIn(t.friendRequest('Ada', 'auth-1').markdownText)
	.find((href) => href.endsWith('/my/settings'))!
	.replace(/\/my\/settings$/, '')

const cases: [string, t.EmailContent][] = [
	['proActivated', t.proActivated('monthly', '2026-09-01T00:00:00.000Z')],
	['proCanceled', t.proCanceled('2026-09-01T00:00:00.000Z')],
	['proResumed', t.proResumed('2026-09-01T00:00:00.000Z')],
	['donationThanks', t.donationThanks('$5')],
	['friendRequest', t.friendRequest('Ada', 'auth-1')],
	['friendAccepted', t.friendAccepted('Ada', 'auth-1')],
	['newMessage', t.newMessage('Ada', 'hello', 'auth-1')],
	['matchResult', t.matchResult('win', 'Ada', 42)],
	['asyncYourTurn', t.asyncYourTurn('Ada', '3 days', 'sess-1')],
	['asyncAutoResigned', t.asyncAutoResigned('Ada', '3 days')],
	['asyncOpponentResigned', t.asyncOpponentResigned('Ada', 'sess-1')],
	['asyncOpponentTimedOut', t.asyncOpponentTimedOut('Ada', 'sess-1')],
]

describe('notification email links', () => {
	it.each(cases)('%s links absolutely into the app', (_name, content) => {
		const hrefs = linksIn(content.markdownText)
		expect(hrefs.length).toBeGreaterThan(0)
		for (const href of hrefs) expect(href.startsWith(`${ORIGIN}/`)).toBe(true)
	})

	it.each(cases)('%s links somewhere beyond the settings footer', (_name, content) => {
		const beyondFooter = linksIn(content.markdownText).filter(
			(href) => href !== `${ORIGIN}/my/settings`
		)
		expect(beyondFooter.length).toBeGreaterThan(0)
	})

	it('points each event at its own page', () => {
		expect(t.friendRequest('Ada', 'auth-1').markdownText).toContain(`${ORIGIN}/my/friends`)
		expect(t.newMessage('Ada', 'hi', 'auth-1').markdownText).toContain(`${ORIGIN}/chat/auth-1`)
		expect(t.friendAccepted('Ada', 'auth-1').markdownText).toContain(`${ORIGIN}/users/auth-1`)
		expect(t.matchResult('win', 'Ada', 42).markdownText).toContain(`${ORIGIN}/replays/42`)
		expect(t.asyncYourTurn('Ada', '3 days', 'sess-1').markdownText).toContain(
			`${ORIGIN}/rooms/sess-1`
		)
	})

	it('escapes ids that would otherwise break out of the path', () => {
		const href = linksIn(t.newMessage('Ada', 'hi', 'a/b?c').markdownText)[0]
		expect(href).toBe(`${ORIGIN}/chat/a%2Fb%3Fc`)
	})
})
