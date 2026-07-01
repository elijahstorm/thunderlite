import type { PageServerLoad } from './$types'
import { queryMyMaps } from '$lib/Database/queryMaps'

export const load: PageServerLoad = async ({ locals }) => {
	const { maps, limit, remaining } = await queryMyMaps(locals.user ?? '')
	return { maps, limit, remaining }
}
