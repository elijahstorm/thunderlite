import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = ({ locals, params }) => {
	const source = locals.user
	if (!source) return error(403, 'Not authorized')
	const target = params.userAuth
	return { source, target }
}
