import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'
import { db } from '$lib/dontcode/server'

export const GET = async ({ url, params, locals }) => {
	const { userAuth } = params
	const source = locals.user
	const target = userAuth
	if (!source) return json({ status: 'not logged in' })
	if (source === target) return json({ status: 'same' })
	const limit = 10
	const page = parseInt(url.searchParams.get('page') ?? '0')

	try {
		const messages = await db.find('messages', {
			where: {
				OR: [
					{ source, target },
					{ source: target, target: source },
				],
			},
			orderBy: { created_at: 'desc' },
			limit,
			offset: (page ?? 0) * limit,
		})

		return json({ messages })
	} catch (msg) {
		logToErrorDb(msg)
		throw error(500, 'Could not access database')
	}
}
