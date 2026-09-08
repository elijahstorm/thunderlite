import { describe, expect, it } from 'vitest'
import {
	DEFAULT_DESCRIPTION,
	DEFAULT_TITLE,
	NOINDEX_PREFIXES,
	SITE_URL,
	absoluteUrl,
	isNoindexPath,
	resolveSeo,
} from '$lib/Seo/seo'
import { BATTALION_FAQ, HOME_FAQ } from '$lib/Seo/faq'
import { faqJsonLd, graph, videoGameJsonLd, websiteJsonLd } from '$lib/Seo/jsonLd'

describe('resolveSeo', () => {
	it('falls back to the site defaults when a page asks for nothing', () => {
		const seo = resolveSeo('/', undefined, {})

		expect(seo.title).toBe(DEFAULT_TITLE)
		expect(seo.description).toBe(DEFAULT_DESCRIPTION)
		expect(seo.canonical).toBe(`${SITE_URL}/`)
	})

	it('appends the brand to a page title, but never twice', () => {
		expect(resolveSeo('/privacy', { title: 'Privacy Policy' }).title).toBe(
			'Privacy Policy | ThunderLite'
		)
		expect(resolveSeo('/about', { title: 'About ThunderLite' }).title).toBe('About ThunderLite')
	})

	// A canonical built from the request origin would have every preview
	// deployment declaring itself the original of the same page.
	it('canonicalises against the production origin, not the request', () => {
		expect(resolveSeo('/battalion-arena', undefined).canonical).toBe(`${SITE_URL}/battalion-arena`)
	})

	it('strips a trailing slash so /about and /about/ cannot self-compete', () => {
		expect(resolveSeo('/about/', undefined).canonical).toBe(`${SITE_URL}/about`)
		// The root is the one path whose slash is the canonical form.
		expect(resolveSeo('/', undefined).canonical).toBe(`${SITE_URL}/`)
	})

	it('makes og images absolute', () => {
		expect(resolveSeo('/', undefined).image).toBe(`${SITE_URL}/images/embedded-card.png`)
		expect(resolveSeo('/', { image: 'https://cdn.example.com/a.png' }).image).toBe(
			'https://cdn.example.com/a.png'
		)
	})

	it('noindexes signed-in and dev routes by prefix, including the bare path', () => {
		expect(resolveSeo('/play/abc', undefined).robots).toContain('noindex')
		expect(resolveSeo('/make', undefined).robots).toContain('noindex')
		expect(resolveSeo('/dev/los', undefined).robots).toContain('noindex')
		expect(resolveSeo('/replays/42', undefined).robots).toContain('noindex')
		expect(resolveSeo('/users/someone', undefined).robots).toContain('noindex')
	})

	it('leaves the public pages indexable', () => {
		for (const path of ['/', '/about', '/battalion-arena', '/campaign', '/map/abc', '/privacy']) {
			expect(isNoindexPath(path), path).toBe(false)
			expect(resolveSeo(path, undefined).robots, path).toContain('index, follow')
		}
	})

	// `/map/...` must not be caught by `/make`, and `/campaign` must not be
	// caught by `/chat`: a prefix list is only safe while nothing collides.
	it('does not let a noindex prefix swallow a neighbouring public route', () => {
		for (const prefix of NOINDEX_PREFIXES) {
			for (const path of ['/', '/about', '/battalion-arena', '/campaign', '/map/abc', '/privacy']) {
				expect(path.startsWith(prefix), `${prefix} vs ${path}`).toBe(false)
			}
		}
	})

	// Structured data on a page nobody may index is wasted markup at best and a
	// contradictory signal at worst.
	it('drops structured data from a noindexed page', () => {
		const seo = resolveSeo('/play/abc', { jsonLd: [videoGameJsonLd()] })
		expect(seo.jsonLd).toEqual([])
	})
})

describe('absoluteUrl', () => {
	it('leaves absolute urls alone and roots relative ones', () => {
		expect(absoluteUrl('https://example.com/x')).toBe('https://example.com/x')
		expect(absoluteUrl('/images/a.png')).toBe(`${SITE_URL}/images/a.png`)
		expect(absoluteUrl('images/a.png')).toBe(`${SITE_URL}/images/a.png`)
	})
})

describe('structured data', () => {
	it('wires the graph nodes together by @id', () => {
		const nodes = graph([websiteJsonLd(), videoGameJsonLd()])
		const [site, game] = nodes['@graph'] as Record<string, unknown>[]

		expect(nodes['@context']).toBe('https://schema.org')
		expect((game.isPartOf as Record<string, string>)['@id']).toBe(site['@id'])
	})

	// Google flags a rating with no reviews behind it, and an invented one is a
	// claim the site cannot back up.
	it('claims no rating it cannot evidence', () => {
		const game = videoGameJsonLd() as Record<string, unknown>
		expect(game.aggregateRating).toBeUndefined()
		expect(game.review).toBeUndefined()
	})

	it('states the free-to-play claim in a machine-readable field', () => {
		const game = videoGameJsonLd() as Record<string, unknown>
		expect(game.isAccessibleForFree).toBe(true)
		expect((game.offers as Record<string, string>).price).toBe('0')
	})
})

describe('faq content', () => {
	// The schema is generated from the same array the page renders. If a future
	// edit ever splits them, this is the test that should fail first.
	it('generates one Question per rendered item, in order', () => {
		const schema = faqJsonLd(HOME_FAQ) as { mainEntity: Record<string, never>[] }

		expect(schema.mainEntity).toHaveLength(HOME_FAQ.length)
		schema.mainEntity.forEach((entry, index) => {
			expect(entry.name).toBe(HOME_FAQ[index].q)
			expect((entry.acceptedAnswer as unknown as { text: string }).text).toBe(HOME_FAQ[index].a)
		})
	})

	it('answers in full sentences, since a fragment is not quotable', () => {
		for (const { q, a } of [...HOME_FAQ, ...BATTALION_FAQ]) {
			expect(q.endsWith('?'), q).toBe(true)
			expect(a.length, q).toBeGreaterThan(80)
			expect(a.trim().endsWith('.'), q).toBe(true)
		}
	})

	it('asks each question only once across both pages', () => {
		const all = [...HOME_FAQ, ...BATTALION_FAQ].map((item) => item.q.toLowerCase())
		expect(new Set(all).size).toBe(all.length)
	})
})
