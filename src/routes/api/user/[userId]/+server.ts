import { error, json } from '@sveltejs/kit'
import { getUserDBDataFromAuth } from '$lib/Database/getUserData.js'

export const GET = async ({ params, locals }) => {
	const userSession = locals.session
	if (!userSession) throw error(401, 'User not logged in')
	const { userId } = params
	const user = await getUserDBDataFromAuth(userId)
	return json({ user })
}
