import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getPrefs } from '$lib/Notifications/email.server'

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`)
	}
	const prefs = await getPrefs(locals.user).catch(() => null)
	return { prefs }
}
