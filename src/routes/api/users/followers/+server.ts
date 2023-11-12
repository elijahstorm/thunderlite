import { json, type RequestHandler } from '@sveltejs/kit'
import { queryFollowers } from '$lib/Database/queryUsers'

export const GET: RequestHandler = async ({ request, locals }) =>
	json(queryFollowers(locals.sql, await request.json(), locals.user))
