import type { PageLoad } from './$types'
import type { PageSeo } from '$lib/Seo/seo'

export const prerender = true

export const load: PageLoad = () => {
	const seo: PageSeo = {
		title: 'Privacy Policy',
		description:
			'What ThunderLite stores, why it stores it, and who it is shared with. No ad networks, no data sales, and no tracking beyond what running the accounts and multiplayer requires.',
		type: 'article',
	}
	return { seo }
}
