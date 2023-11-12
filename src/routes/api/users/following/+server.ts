import { json, type RequestHandler } from '@sveltejs/kit'
import { queryFollowing } from '$lib/Database/queryUsers'

export const GET: RequestHandler = async ({ request, locals }) =>
	json(queryFollowing(locals.sql, await request.json(), locals.user))
