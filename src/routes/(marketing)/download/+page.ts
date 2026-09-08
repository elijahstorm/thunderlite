import type { PageLoad } from './$types'
import type { PageSeo } from '$lib/Seo/seo'

export const prerender = true

/**
 * "download thunderlite" is a query that will happen regardless, so the page
 * exists to catch it and immediately say there is nothing to download. Thin,
 * but it answers its one question, which is more than a 404 does.
 */
export const load: PageLoad = () => {
	const seo: PageSeo = {
		title: 'Download ThunderLite: No Download Needed',
		description:
			'ThunderLite needs no download and no install. It runs entirely in a web browser on desktop and mobile. If native builds ever ship, they will appear on this page first.',
	}
	return { seo }
}
