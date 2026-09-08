import type { PageLoad } from './$types'
import type { PageSeo } from '$lib/Seo/seo'
import { breadcrumbJsonLd, videoGameJsonLd } from '$lib/Seo/jsonLd'

export const prerender = true

export const load: PageLoad = () => {
	const seo: PageSeo = {
		title: 'About ThunderLite: Who Builds It and Why',
		description:
			'ThunderLite is a browser recreation of Urban Squall’s Battalion: Arena, built and maintained in the open by one developer, Elijah Storm, and sponsored by DontCode. No ads, no paywalls, no tracking beyond the basics.',
		type: 'article',
		jsonLd: [
			videoGameJsonLd(),
			breadcrumbJsonLd([
				{ name: 'ThunderLite', path: '/' },
				{ name: 'About', path: '/about' },
			]),
		],
	}
	return { seo }
}
