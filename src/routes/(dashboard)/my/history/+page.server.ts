import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getMatchHistory } from '$lib/Database/getMatchHistory'

/** Matches per history page. One extra wave of queries per page, so keep it roomy. */
const PER_PAGE = 25

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw error(403, 'You are not logged in')

	const pageParam = Number(url.searchParams.get('page') ?? '1')
	const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.trunc(pageParam) : 1

	const { entries, total } = await getMatchHistory(locals.user, {
		limit: PER_PAGE,
		offset: (page - 1) * PER_PAGE,
	})

	return { entries, total, page, perPage: PER_PAGE }
}
