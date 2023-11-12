import { json, type RequestHandler } from '@sveltejs/kit'
import { queryUsers } from '$lib/Database/queryUsers'

export const GET: RequestHandler = async ({ request, locals }) =>
	json(queryUsers(locals.sql, await request.json(), locals.user))
