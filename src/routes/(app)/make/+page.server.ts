import type { PageServerLoad } from './$types'
import { queryMaps } from '$lib/Database/queryMaps'

export const load: PageServerLoad = ({ locals }) => queryMaps(locals.sql, {}, locals.user)
