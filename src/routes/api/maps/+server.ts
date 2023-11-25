import { json, type RequestHandler } from '@sveltejs/kit'
import { queryMaps } from '$lib/Database/queryMaps'

export const GET: RequestHandler = async ({ url, locals }) =>
	json(
		await queryMaps(
			locals.sql,
			{
				search: url.searchParams.get('search') ?? '',
				type: url.searchParams.get('type') ?? '',
				page: parseInt(url.searchParams.get('page') ?? '0'),
			},
			locals.user
		)
	)
