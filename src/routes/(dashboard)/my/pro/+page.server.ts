import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getSubscription, toView } from '$lib/Pro/subscription.server'

export const prerender = false

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`)
	}

	const sub = await getSubscription(locals.user).catch(() => null)
	return { subscription: toView(sub) }
}
