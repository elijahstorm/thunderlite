import { json, type RequestHandler } from '@sveltejs/kit'
import { queryUsers } from '$lib/Database/queryUsers'

export const GET: RequestHandler = async ({ url, locals }) =>
	json(
		await queryUsers(
			locals.sql,
			{ page: parseInt(url.searchParams.get('page') ?? '0') },
			locals.user
		)
	)
