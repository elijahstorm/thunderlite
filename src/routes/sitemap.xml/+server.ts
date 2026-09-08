import type { RequestHandler } from './$types'
import { db } from '$lib/dontcode/server'
import { campaignLevels } from '$lib/Campaign/levels'
import { SITE_URL } from '$lib/Seo/seo'

interface Entry {
	path: string
	changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly'
	priority: string
	lastmod?: string
}

// The hand-written pages, highest intent first. Anything under
// NOINDEX_PREFIXES is absent by construction: a sitemap that lists a URL the
// site also marks noindex is a "Discovered, currently not indexed" warning in
// Search Console, not a second chance at ranking.
const STATIC_ENTRIES: Entry[] = [
	{ path: '/', changefreq: 'weekly', priority: '1.0' },
	{ path: '/battalion-arena', changefreq: 'monthly', priority: '0.9' },
	{ path: '/campaign', changefreq: 'monthly', priority: '0.8' },
	{ path: '/about', changefreq: 'monthly', priority: '0.6' },
	{ path: '/download', changefreq: 'yearly', priority: '0.3' },
	{ path: '/privacy', changefreq: 'yearly', priority: '0.2' },
]

// Community maps are the only part of the sitemap that grows on its own, and
// they are capped: past a few hundred URLs the tail is thin-content filler that
// spends crawl budget without earning impressions. Newest first, so a map
// published today is the one that gets crawled.
const MAP_LIMIT = 500

const escape = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const urlNode = ({ path, changefreq, priority, lastmod }: Entry) =>
	[
		'\t<url>',
		`\t\t<loc>${escape(`${SITE_URL}${path}`)}</loc>`,
		lastmod ? `\t\t<lastmod>${lastmod}</lastmod>` : '',
		`\t\t<changefreq>${changefreq}</changefreq>`,
		`\t\t<priority>${priority}</priority>`,
		'\t</url>',
	]
		.filter(Boolean)
		.join('\n')

/**
 * One gateway call, behind a day of CDN caching. Google re-fetches a sitemap on
 * its own schedule and would happily do so hourly; `s-maxage` is what keeps
 * that off the per-namespace db budget (see .claude/gateway-call-budget-at-scale.md).
 */
const publicMapEntries = async (): Promise<Entry[]> => {
	try {
		const rows = await db.find<{ public_id: string; updated_at: string | Date }>('maps', {
			where: { status: { not: 'private' }, deleted_at: null },
			select: ['public_id', 'updated_at'],
			orderBy: { updated_at: 'desc' },
			limit: MAP_LIMIT,
		})

		return rows.map((row) => ({
			path: `/map/${row.public_id}`,
			changefreq: 'monthly' as const,
			priority: '0.5',
			lastmod: new Date(row.updated_at).toISOString().slice(0, 10),
		}))
	} catch {
		// A sitemap missing its map section still gets the static pages crawled;
		// a 500 gets the whole file marked as an error in Search Console.
		return []
	}
}

export const GET: RequestHandler = async ({ setHeaders }) => {
	const campaign: Entry[] = campaignLevels.map((level) => ({
		path: `/campaign/${level.id}`,
		changefreq: 'monthly',
		priority: '0.6',
	}))

	const entries = [...STATIC_ENTRIES, ...campaign, ...(await publicMapEntries())]

	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...entries.map(urlNode),
		'</urlset>',
		'',
	].join('\n')

	setHeaders({
		'content-type': 'application/xml; charset=utf-8',
		'cache-control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
	})

	return new Response(body)
}
