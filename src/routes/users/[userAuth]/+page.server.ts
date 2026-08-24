import type { PageServerLoad } from './$types'
import { getUserDBDataFromAuth } from '$lib/Database/getUserData'
import { getUserStats } from '$lib/Database/getUserStats'
import { getEloHistory } from '$lib/Database/getEloHistory'
import { queryUserPublicMaps } from '$lib/Database/queryMaps'

/**
 * Public player profile. Loads the user, their aggregated match stats (J3),
 * their ladder curve, and the maps they've shared. Viewable signed-out (it is
 * not under a protected route), so `me` falls back to an empty string for the
 * relationship sub-queries.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const { userAuth } = params
	const [user, stats, eloHistory, { maps }] = await Promise.all([
		getUserDBDataFromAuth(userAuth, locals.user ?? ''),
		getUserStats(userAuth),
		getEloHistory(userAuth),
		queryUserPublicMaps(userAuth),
	])

	return { user, stats, eloHistory, maps, me: locals.user ?? null }
}
