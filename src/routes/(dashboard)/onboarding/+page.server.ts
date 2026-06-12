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
import { db } from '$lib/dontcode/server'

export const prerender = false
export const ssr = false

export const load: PageServerLoad = async ({ locals }) => {
	const auth = locals.user
	if (!auth) throw error(403, 'You are not logged in')

	try {
		const user = await getUserDBDataFromAuth(auth)
		if (user.username && user.profile_image_url) {
			throw redirect(302, '/make')
		}
		return { auth, user }
	} catch (e) {
		if ((e as { status?: number })?.status === 302) {
			throw redirect(302, '/make')
		}
		try {
			await makeUserDBDataFromAuth(auth)
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			if (Object.hasOwn(e, 'status') && e.status === 500) {
				await migrate()
				await makeUserDBDataFromAuth(auth)
				await faker(auth)
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
