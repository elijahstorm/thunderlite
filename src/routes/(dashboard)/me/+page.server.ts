import {
	getUserDBDataFromAuth,
	makeUserDBDataFromAuth,
	updateUserDBData,
} from '$lib/Database/getUserData'
import { error, fail } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { validate } from '$lib/Database/validators'
import { getUserStats } from '$lib/Database/getUserStats'
import { getMatchHistory } from '$lib/Database/getMatchHistory'
import { getEloHistory } from '$lib/Database/getEloHistory'
import { db } from '$lib/dontcode/server'

export const prerender = false
export const ssr = false

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw error(403, 'You are not logged in')

	// The profile fetch, the match-stats fetch, and the recent-games strip are
	// independent, so run them in one barrier. `getUserStats` / `getMatchHistory`
	// are defensive (a brand-new account returns zeros / an empty page), and a
	// profile lookup failure means "no account yet" — caught below to bootstrap
	// one — so swallow it here rather than rejecting the whole barrier.
	let [user, stats, eloHistory, recent] = await Promise.all([
		getUserDBDataFromAuth(locals.user).catch(() => null),
		getUserStats(locals.user),
		getEloHistory(locals.user),
		getMatchHistory(locals.user, { limit: 5 }),
	])

	if (!user) {
		try {
			await makeUserDBDataFromAuth(locals.user, locals.userEmail)
			user = {
				id: -1,
				auth: locals.user,
				username: '',
				display_name: '',
				profile_image_url: '',
				bio: '',
				created_at: new Date(),
			} as UserDBData
		} catch (e) {
			throw error(500, 'There was an issue making your new account')
		}
	}

	return { user, stats, eloHistory, recentGames: recent.entries, totalGames: recent.total }
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
			// Exclude the caller's own row: keeping your existing username while
			// editing the rest of the profile must not read as a conflict.
			const user = await db.find('profiles', {
				where: { username: validated.username, auth: { not: locals.user } },
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
