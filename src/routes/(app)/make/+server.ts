import { json, type RequestHandler } from '@sveltejs/kit'
import { queryMaps } from './queryMaps'

export const GET: RequestHandler = async ({ request }) => json(queryMaps(await request.json()))
