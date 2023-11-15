import { json, type RequestHandler } from '@sveltejs/kit'
import { queryFollowers } from '$lib/Database/queryUsers'

export const GET: RequestHandler = async ({ url, locals }) =>
	json(
		await queryFollowers(
			locals.sql,
			{ page: parseInt(url.searchParams.get('page') ?? '0') },
			locals.user
		)
	)
