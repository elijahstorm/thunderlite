import { json, type RequestHandler } from '@sveltejs/kit'
import { queryFriends } from '$lib/Database/queryUsers'

export const GET: RequestHandler = async ({ url, locals }) =>
	json(
		await queryFriends(
			locals.sql,
			{ page: parseInt(url.searchParams.get('page') ?? '0') },
			locals.user
		)
	)
