import type { PageLoad } from './$types'
import type { PageSeo } from '$lib/Seo/seo'
import { getLevelById } from '$lib/Campaign/levels'

/**
 * A live mission renders a game canvas and nothing a search result could quote,
 * and a locked level redirects to /campaign on mount, so a crawler that landed
 * here would index either an empty page or a bounce. The title is still set for
 * the browser tab and for anyone pasting the link into chat.
 */
export const load: PageLoad = ({ params }) => {
	const level = getLevelById(params.levelId)

	const seo: PageSeo = {
		title: level ? `Campaign: ${level.title}` : 'Campaign',
		description: level
			? `${level.blurb}. Mission ${level.order} of the ThunderLite campaign.`
			: undefined,
		noindex: true,
	}

	return { seo }
}
