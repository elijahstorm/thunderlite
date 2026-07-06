import { json, type RequestHandler } from '@sveltejs/kit'
import { queryMaps, queryMyMaps } from '$lib/Database/queryMaps'

export const GET: RequestHandler = async ({ url, locals }) => {
	// `?mine=1` returns the caller's own library (drafts + published), scoped to
	// their auth — powers the editor's Load picker. Everything else is the public
	// browse/search feed.
	if (url.searchParams.get('mine')) {
		return json(await queryMyMaps(locals.user ?? ''))
	}
	return json(
		await queryMaps(
			{
				search: url.searchParams.get('search') ?? '',
				type: url.searchParams.get('type') ?? '',
				page: parseInt(url.searchParams.get('page') ?? '0'),
			},
			locals.user
		)
	)
}
