import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { listFriendRequests } from '$lib/Database/Relationships/relationships'
import { queryUsersByAuth } from '$lib/Database/getUserData'
import { queryFriends } from '$lib/Database/queryUsers'

/**
 * The friends hub: accepted friends plus the pending requests in both
 * directions. Incoming requests had nowhere to live in the UI before this page,
 * so the friend-request email was the only place they ever surfaced.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user
	if (!me) throw redirect(303, `/login?redirectTo=${encodeURIComponent('/my/friends')}`)

	const { incoming, outgoing } = await listFriendRequests(me)

	const [{ users: friends }, incomingUsers, outgoingUsers] = await Promise.all([
		queryFriends({ page: 0 }, me),
		queryUsersByAuth(incoming, me),
		queryUsersByAuth(outgoing, me),
	])

	return { friends, incoming: incomingUsers, outgoing: outgoingUsers }
}
