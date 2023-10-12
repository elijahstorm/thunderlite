import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const load: PageLoad = ({ params }) => {
	if (params.mapHash === 'as') {
		return { mapHash: params.mapHash }
	}

	throw error(404, 'Map data not found')
}
