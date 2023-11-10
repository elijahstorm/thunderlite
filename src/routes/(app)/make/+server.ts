import { json, type RequestHandler } from '@sveltejs/kit'
import { queryMaps } from '$lib/Database/queryMaps'

export const GET: RequestHandler = async ({ request, locals }) =>
	json(queryMaps(locals.sql, await request.json(), locals.user))
