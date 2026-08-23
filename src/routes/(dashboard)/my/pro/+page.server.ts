import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { getSubscriptionView } from '$lib/Pro/subscription.server'
import { donationsEnabled } from '$lib/Pro/donations.server'

export const prerender = false

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname)}`)
	}

	const subscription = await getSubscriptionView(locals.user).catch(() => null)
	// One-time donations need SDK >= 0.2.8 (payments.requestPayment); hide the card without it.
	return { subscription, donationsEnabled: donationsEnabled() }
}
