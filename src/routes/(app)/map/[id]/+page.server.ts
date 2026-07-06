import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getMapById } from '$lib/Database/queryMaps'

export const load: PageServerLoad = async ({ params, locals }) => {
	const result = await getMapById(params.id, locals.user)
	if (!result) throw error(404, { message: 'No map with that link found.' })

	return {
		map: result.map,
		owner: result.owner,
		signedIn: !!locals.user,
		// Only the authenticated owner may jump straight into the editor for this
		// map; everyone else just gets the "Make game" path.
		isOwner: !!locals.user && locals.user === result.owner.auth,
	}
}
