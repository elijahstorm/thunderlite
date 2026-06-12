import {
	getUserDBDataFromAuth,
	makeUserDBDataFromAuth,
	updateUserDBData,
} from '$lib/Database/getUserData'
import { error, fail } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { validate } from '$lib/Database/validators'
import { getUserStats } from '$lib/Database/getUserStats'
import { db } from '$lib/dontcode/server'

export const prerender = false
export const ssr = false

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(403, 'You are not logged in')
	let user: UserDBData | null = null

	try {
		user = await getUserDBDataFromAuth(locals.user)
	} catch (e) {
		try {
			await makeUserDBDataFromAuth(locals.user)
			user = {
				id: -1,
				auth: locals.user,
				username: '',
				display_name: '',
				profile_image_url: '',
				bio: '',
				created_at: new Date(),
			}
		} catch (e) {
			throw error(500, 'There was an issue making your new account')
		}
	}

	// J3 — profile match record. Defensive in getUserStats, so a brand-new
	// account (no match rows) returns zeros rather than throwing.
	const stats = await getUserStats(locals.user)

	return { user, stats }
}

export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) return fail(403, {})

		const rules = {
			username: 'required|string|noWhitespace|max:20|min:5',
			display_name: 'required|string|max:30|min:5',
			bio: 'string|max:1000',
		}

		const { validated, errors } = validate(await request.formData(), rules)

		if (Object.keys(errors).length > 0) return fail(400, { errors })

		if (validated.username && typeof validated.username === 'string') {
			const user = await db.find('profiles', {
				where: { username: validated.username },
				select: ['id'],
			})
			if (user.length) {
				return fail(400, { errors: { username: ['Sorry! This username is already taken'] } })
			}
		}

		await updateUserDBData(
			locals.user,
			validated as UserDBData,
			Object.keys(validated) as (keyof UserDBData)[]
		)

		return {
			validated,
			errors,
		}
	},
}
