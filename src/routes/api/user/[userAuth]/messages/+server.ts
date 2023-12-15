import { error, json } from '@sveltejs/kit'
import { logToErrorDb } from '$lib/Security/serverLogs.js'

export const GET = async ({ url, params, locals }) => {
	const { userAuth } = params
	const source = locals.user
	const target = userAuth
	if (!source) return json({ status: 'not logged in' })
	if (source === target) return json({ status: 'same' })
	const limit = 10
	const page = parseInt(url.searchParams.get('page') ?? '0')

	try {
		const messages = await locals.sql`
			select * from messages
			where
                source = ${source} and target = ${target} or
                source = ${target} and target = ${source}
            order by created_at desc
            limit ${limit} offset ${(page ?? 0) * limit}`

		return json({ messages })
	} catch (msg) {
		logToErrorDb(locals.sql)(msg)
		error(500, 'Could not access database');
	}
}
