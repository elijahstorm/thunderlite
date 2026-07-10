import type { PageServerLoad } from './$types'
import { queryMaps } from '$lib/Database/queryMaps'
import { getMapTypes } from '$lib/Database/getMapTypes'

// Return the promises WITHOUT awaiting them so SvelteKit streams the page shell
// immediately and flushes the listing + type chips in as each resolves. The two
// queries are independent, so kicking them off together (rather than
// `await`-ing one then the other) also runs them concurrently.
export const load: PageServerLoad = ({ locals }) => ({
	listing: queryMaps({}, locals.user),
	mapTypes: getMapTypes(),
})
