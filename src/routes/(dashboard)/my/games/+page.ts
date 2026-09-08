import { redirect } from '@sveltejs/kit'

/**
 * `/my/games` used to be the match archive, which read as "the games I am
 * playing" and sent people hunting for their in-progress matches here. Those
 * now live at `/games`; the archive moved to `/my/history`. Old links, emails
 * and bookmarks land here, so forward them rather than 404.
 */
export const load = () => {
	throw redirect(308, '/my/history')
}
