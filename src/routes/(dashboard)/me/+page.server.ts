import {
	getUserDBDataFromAuth,
	makeUserDBDataFromAuth,
	updateUserDBData,
} from '$lib/Database/getUserData'
import { error, fail } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { migrate } from '$lib/Database/Migrations/migrator'
import { validate } from '$lib/Database/validators'

export const prerender = false
export const ssr = false

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(403, 'You are not logged in')
	let user: UserDBData | null = null

	try {
		user = await getUserDBDataFromAuth(locals.sql, locals.user)
	} catch (e) {
		try {
			await makeUserDBDataFromAuth(locals.user)(locals.sql)
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			if (Object.hasOwn(e, 'status') && e.status === 500) {
				await migrate(locals.sql)
				await makeUserDBDataFromAuth(locals.user)(locals.sql)
			} else {
				throw error(500, 'There was an issue making your new account')
			}
		}
		user = {
			id: -1,
			auth: locals.user,
			username: '',
			display_name: '',
			profile_image_url: '',
			bio: '',
			created_at: new Date(),
		}
	}

	return { user }
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
