import type { RequestHandler } from './$types'
import { NOINDEX_PREFIXES, SITE_URL } from '$lib/Seo/seo'

// Static file, no data behind it — baked at build so a crawler's first request
// never touches a function or spends a gateway call.
export const prerender = true

/**
 * The Disallow list mirrors NOINDEX_PREFIXES, which is also what stamps
 * `noindex` on the pages themselves. Two layers on purpose: robots.txt keeps
 * the crawl budget on pages worth ranking, and the meta tag catches anything
 * that got linked from elsewhere and crawled anyway.
 *
 * GPTBot / ClaudeBot / PerplexityBot are allowed deliberately. Being quotable
 * by an answer engine is the point; blocking them costs the citations that this
 * site's whole discovery story depends on.
 */
export const GET: RequestHandler = () => {
	const body = [
		'User-agent: *',
		...NOINDEX_PREFIXES.map((prefix) => `Disallow: ${prefix}/`),
		'',
		'Sitemap: ' + `${SITE_URL}/sitemap.xml`,
		'',
	].join('\n')

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=0, s-maxage=86400',
		},
	})
}
