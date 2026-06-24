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
import { validate } from '$lib/Database/validators'
import { db } from '$lib/dontcode/server'
import { safeRedirect } from '$lib/safeRedirect'

export const prerender = false
export const ssr = false

export const load: PageServerLoad = async ({ locals, url }) => {
	const auth = locals.user
	if (!auth) throw error(403, 'You are not logged in')

	// Where to land once the profile is set up. Defaults to /make when login
	// wasn't triggered by a redirect from somewhere specific.
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo')) ?? '/make'

	try {
		const user = await getUserDBDataFromAuth(auth)
		if (user.username && user.profile_image_url) {
			throw redirect(302, redirectTo)
		}
		return { auth, user, redirectTo }
	} catch (e) {
		if ((e as { status?: number })?.status === 302) {
			throw redirect(302, redirectTo)
		}
		// The schema is applied out-of-band via `pnpm migrate` (scripts/migrate.ts),
		// so first-time profile creation should just work; a failure here is a real
		// error rather than a cue to self-migrate from the request path.
		try {
			await makeUserDBDataFromAuth(auth)
		} catch {
			throw error(500, 'There was an issue making your new account')
		}
	}

	return { auth, redirectTo }
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
