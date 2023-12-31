// redirect if account made
// otherwise show form to make account
// then redirect to /me

import {
	getUserDBDataFromAuth,
	makeUserDBDataFromAuth,
	updateUserDBData,
} from '$lib/Database/getUserData'
import { error, fail, redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { faker, migrate } from '$lib/Database/Migrations/migrator'
import { validate } from '$lib/Database/validators'

export const prerender = false
export const ssr = false

export const load: PageServerLoad = async ({ locals }) => {
	const auth = locals.user
	if (!auth) throw error(403, 'You are not logged in')

	try {
		const user = await getUserDBDataFromAuth(locals.sql, auth)
		if (user.username && user.profile_image_url) {
			throw redirect(302, '/make')
		}
		return { auth, user }
	} catch (e) {
		if (e.status === 302) {
			throw redirect(302, '/make')
		}
		try {
			await makeUserDBDataFromAuth(auth)(locals.sql)
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			if (Object.hasOwn(e, 'status') && e.status === 500) {
				await migrate(locals.sql)
				await makeUserDBDataFromAuth(auth)(locals.sql)
				await faker(locals.sql, auth)
			} else {
				throw error(500, 'There was an issue making your new account')
			}
		}
	}

	return { auth }
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
			const user = await locals.sql`select id from users where username = ${validated.username}`
			if (user.length) {
				return fail(400, { errors: { username: ['Sorry! This username is already taken'] } })
			}
		}

		await updateUserDBData(
			locals.user,
			validated as UserDBData,
			Object.keys(validated) as (keyof UserDBData)[]
		)(locals.sql)

		return {
			validated,
			errors,
		}
	},
}
