import type { PageLoad } from './$types'
import type { PageSeo } from '$lib/Seo/seo'
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '$lib/Seo/seo'
import { HOME_FAQ } from '$lib/Seo/faq'
import { authorJsonLd, faqJsonLd, videoGameJsonLd, websiteJsonLd } from '$lib/Seo/jsonLd'

export const prerender = true

/**
 * The home page carries the entity graph for the whole site: the WebSite node,
 * the Person who publishes it, and the VideoGame everything else references by
 * @id. The FAQ block is generated from the same array the page renders, so the
 * structured data can never describe an answer a visitor cannot read.
 */
export const load: PageLoad = () => {
	const seo: PageSeo = {
		title: DEFAULT_TITLE,
		description: DEFAULT_DESCRIPTION,
		jsonLd: [authorJsonLd(), websiteJsonLd(), videoGameJsonLd(), faqJsonLd(HOME_FAQ)],
	}

	return { seo }
}
