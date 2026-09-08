import type { PageLoad } from './$types'
import type { PageSeo } from '$lib/Seo/seo'
import { BATTALION_FAQ } from '$lib/Seo/faq'
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd, videoGameJsonLd } from '$lib/Seo/jsonLd'

export const prerender = true

/**
 * The one page most likely to rank on merit.
 *
 * "Battalion: Arena" is a real query with real intent behind it (people looking
 * for a game that has been offline since 2012) and the pages currently holding
 * those results are a Fandom wiki stub and a 2009 review. Neither answers the
 * question the searcher is actually asking, which is whether they can play it.
 * This page answers that, so it competes on usefulness rather than on domain
 * authority this site does not have.
 */
export const load: PageLoad = () => {
	const seo: PageSeo = {
		title: 'Battalion: Arena Is Gone. ThunderLite Is the Free Browser Rebuild',
		description:
			'Battalion: Arena shut down in 2012 and Flash is dead, so the original is unplayable. ThunderLite is a free, from-scratch rebuild in the Advance Wars family that runs in any browser, needs no account for single player, and supports live and async multiplayer.',
		type: 'article',
		jsonLd: [
			articleJsonLd({
				headline: 'Battalion: Arena is gone. ThunderLite is the free browser rebuild.',
				description:
					'What happened to Urban Squall’s Battalion: Arena, why it can no longer be played, and how ThunderLite rebuilds it for the modern browser.',
				path: '/battalion-arena',
				datePublished: '2026-09-08',
			}),
			faqJsonLd(BATTALION_FAQ),
			videoGameJsonLd(),
			breadcrumbJsonLd([
				{ name: 'ThunderLite', path: '/' },
				{ name: 'Battalion: Arena', path: '/battalion-arena' },
			]),
		],
	}

	return { seo }
}
