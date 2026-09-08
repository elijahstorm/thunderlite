import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getMapById } from '$lib/Database/queryMaps'
import { breadcrumbJsonLd, IDS } from '$lib/Seo/jsonLd'
import { absoluteUrl, type PageSeo } from '$lib/Seo/seo'

export const load: PageServerLoad = async ({ params, locals }) => {
	const result = await getMapById(params.id, locals.user)
	if (!result) throw error(404, { message: 'No map with that link found.' })

	return {
		seo: mapSeo(
			result.map,
			result.owner.display_name || result.owner.username || 'a ThunderLite player'
		),
		map: result.map,
		owner: result.owner,
		signedIn: !!locals.user,
		// Only the authenticated owner may jump straight into the editor for this
		// map; everyone else just gets the "Make game" path.
		isOwner: !!locals.user && locals.user === result.owner.auth,
	}
}

/**
 * Published maps are the only content on this site that grows without anyone
 * writing copy, which makes them the long tail worth indexing. Each one gets a
 * title naming the map and its author, and a description that falls back to a
 * generated sentence when the author left the field blank -- a listing whose
 * description is empty is one Google writes itself, usually badly.
 *
 * `CreativeWork` rather than `VideoGame`: the map is a thing made for the game,
 * not another game, and saying so keeps the site's single VideoGame entity
 * unambiguous.
 */
const mapSeo = (
	map: { public_id: string; name: string; description: string; thumbnail: string },
	author: string
): PageSeo => {
	const name = map.name?.trim() || 'Untitled map'
	const description =
		map.description?.trim() ||
		`${name} is a community-built ThunderLite map by ${author}. Start a live or async match on it straight from the browser, free and with no download.`

	return {
		title: `${name}: a ThunderLite map by ${author}`,
		description,
		image: map.thumbnail || undefined,
		jsonLd: [
			{
				'@type': 'CreativeWork',
				name,
				description,
				url: absoluteUrl(`/map/${map.public_id}`),
				creator: { '@type': 'Person', name: author },
				isPartOf: { '@id': IDS.game },
				genre: 'Turn-based strategy map',
				isAccessibleForFree: true,
			},
			breadcrumbJsonLd([
				{ name: 'ThunderLite', path: '/' },
				{ name: 'Maps', path: '/make' },
				{ name, path: `/map/${map.public_id}` },
			]),
		],
	}
}
