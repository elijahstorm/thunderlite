import type { PageServerLoad } from './$types'
import { queryMaps } from '$lib/Database/queryMaps'
import { getMapTypes } from '$lib/Database/getMapTypes'

export const load: PageServerLoad = async ({ locals }) => ({
	...(await queryMaps({}, locals.user)),
	mapTypes: await getMapTypes(),
})
