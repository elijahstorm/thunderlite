import { createClient } from '@vercel/kv'
import type { PageServerLoad } from './$types'
import { KV_REST_API_READ_ONLY_TOKEN, KV_REST_API_URL } from '$env/static/private'

export const load: PageServerLoad = async ({ locals }) => {
	const kv = createClient({
		url: KV_REST_API_URL,
		token: KV_REST_API_READ_ONLY_TOKEN,
	})

	const gameData = (await kv.hgetall(`user-game:${locals?.session ?? ''}`)) as unknown as {
		session: string
		sha: string
	} | null

	return {
		user: locals.user,
		session: locals.session,
		gameData,
	}
}
