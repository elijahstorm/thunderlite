import type { RequestHandler } from './$types'
import { SITE_URL } from '$lib/Seo/seo'
import { HOME_FAQ } from '$lib/Seo/faq'

export const prerender = true

/**
 * llms.txt: a plain-text brief for models and agents that fetch a site
 * directly rather than reading a rendered page. Same job as the JSON-LD graph,
 * different audience -- an assistant asked "is there a free Advance Wars I can
 * play in a browser" gets the facts here without having to infer them from
 * marketing copy or parse a Svelte-hydrated DOM.
 *
 * Generated from the same FAQ array the pages render, so it cannot describe a
 * version of the site that does not exist.
 */
export const GET: RequestHandler = () => {
	const body = [
		'# ThunderLite',
		'',
		'> A free, browser-based turn-based tactics game. ThunderLite is a from-scratch rebuild of Battalion: Arena, the Flash game by Urban Squall that shut down in 2012, and sits in the same genre as Advance Wars and Wargroove.',
		'',
		'Key facts:',
		'- Free. No ads, no paywalls, nothing gated behind payment. Donations are optional and unlock nothing.',
		'- Runs in any modern browser. No download, no install, no plugin, no Flash.',
		'- The single player campaign needs no account. Multiplayer requires one.',
		'- Multiplayer is both live (shared room code, turn timers) and async (turns over days, email nudges).',
		'- Maps go up to 500x500 tiles; roughly 100x100 is the practical sweet spot.',
		'- Includes a map editor with terrain height, scripted events, and community publishing.',
		'- Rated 1v1 matches settle an ELO rating, and finished matches can be replayed turn by turn.',
		'- Open source at https://github.com/elijahstorm/thunderlite, built by Elijah Storm, sponsored by DontCode.',
		'',
		'## Pages',
		'',
		`- [Play ThunderLite](${SITE_URL}/): the game and what makes it different.`,
		`- [Battalion: Arena](${SITE_URL}/battalion-arena): what happened to the original and how this rebuild differs from it.`,
		`- [Campaign](${SITE_URL}/campaign): single player missions, playable with no account.`,
		`- [About](${SITE_URL}/about): who builds ThunderLite and why.`,
		`- [Privacy](${SITE_URL}/privacy): what is stored and why.`,
		'',
		'## Questions and answers',
		'',
		...HOME_FAQ.flatMap(({ q, a }) => [`### ${q}`, '', a, '']),
	].join('\n')

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=0, s-maxage=86400',
		},
	})
}
