import { json, type RequestHandler } from '@sveltejs/kit'
import { queryMaps } from '$lib/Database/queryMaps'

export const GET: RequestHandler = async ({ request }) => json(queryMaps(await request.json()))
