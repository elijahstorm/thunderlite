import { dev } from '$app/environment'
import { error } from '@sveltejs/kit'

// Dev-only. The run itself happens server-side in this process against whatever
// gateway DONTCODE_API_URL points at, so pointing it at production is a real
// stress test of a real budget. The page is just the controls and the gauges.
export const load = () => {
	if (!dev) throw error(404, 'Not found')
}

export const ssr = false
