import type { PageServerLoad } from './$types'
import { getMapHash } from '$lib/Map/hashLoader'

export const load: PageServerLoad = async ({ params, locals }) => getMapHash(locals.sql, params.sha)
