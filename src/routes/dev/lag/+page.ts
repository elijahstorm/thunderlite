import { dev } from '$app/environment'
import { error } from '@sveltejs/kit'

// Dev-only lag inspector. The endpoints it reads are reachable in production
// (the gateway ledger behind DIAGNOSTICS_TOKEN, a room's trace by its members),
// but the page itself is a debugging surface and stays out of the build.
export const load = () => {
	if (!dev) throw error(404, 'Not found')
}

export const ssr = false
