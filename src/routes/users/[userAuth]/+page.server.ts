import type { PageServerLoad } from './$types'
import { getUserDBDataFromAuth } from '$lib/Database/getUserData'
import { getUserStats } from '$lib/Database/getUserStats'

/**
 * Public player profile. Loads the user and their aggregated match stats (J3).
 * Viewable signed-out (it is not under a protected route), so `me` falls back
 * to an empty string for the relationship sub-queries.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const { userAuth } = params
	const user = await getUserDBDataFromAuth(locals.sql, userAuth, locals.user ?? '')
	const stats = await getUserStats(locals.sql, userAuth)

	return { user, stats }
}
