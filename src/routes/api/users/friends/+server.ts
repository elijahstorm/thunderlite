import { json, type RequestHandler } from '@sveltejs/kit'
import { queryFriends } from '$lib/Database/queryUsers'

export const GET: RequestHandler = async ({ request, locals }) =>
	json(queryFriends(locals.sql, await request.json(), locals.user))
