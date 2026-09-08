import type { PageLoad } from './$types'
import type { PageSeo } from '$lib/Seo/seo'
import { breadcrumbJsonLd, videoGameJsonLd } from '$lib/Seo/jsonLd'

/**
 * Indexable on purpose even though it sits in the (app) group: the campaign is
 * playable with no account, so this is a real landing page for "free turn-based
 * strategy, no signup" rather than a gate a crawler bounces off.
 */
export const load: PageLoad = () => {
	const seo: PageSeo = {
		title: 'Single Player Campaign: Free Turn-Based Strategy, No Signup',
		description:
			'Play the ThunderLite campaign free in your browser with no account and no download. A run of hand-built missions against an adaptive CPU that reads the board instead of following a script.',
		jsonLd: [
			videoGameJsonLd(),
			breadcrumbJsonLd([
				{ name: 'ThunderLite', path: '/' },
				{ name: 'Campaign', path: '/campaign' },
			]),
		],
	}
	return { seo }
}
