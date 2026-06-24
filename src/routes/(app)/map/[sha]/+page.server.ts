import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getMapBySha } from '$lib/Database/queryMaps'

export const load: PageServerLoad = async ({ params, locals }) => {
	const result = await getMapBySha(params.sha, locals.user)
	if (!result) throw error(404, { message: 'No map with that link found.' })

	return {
		map: result.map,
		owner: result.owner,
		signedIn: !!locals.session,
	}
}
