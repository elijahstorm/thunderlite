import { getUserDBDataFromAuth } from '$lib/Database/getUserData'
import { error, fail } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const prerender = false
export const ssr = false

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(403, 'You are not logged in')
	const user = await getUserDBDataFromAuth(locals.user)
	return { user }
}

export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(403, {})

		const data = await request.formData()
		const email = data.get('email')

		console.log(email)
		if (!email) return fail(400, { email, missing: true })
		if (email === 'bad') return fail(400, { email, incorrect: true })

		return {
			success: true,
		}
	},
}
