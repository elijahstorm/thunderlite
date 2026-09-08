/**
 * One place that decides what search engines and answer engines see.
 *
 * Every meta tag on the site is rendered once, by the root layout, from the
 * value `resolveSeo` returns. Pages contribute by returning a `seo` object from
 * their load function rather than opening their own `<svelte:head>` — two
 * components writing `<meta name="description">` produces two of them in the
 * SSR output (Svelte only dedupes `<title>`), and a page with two descriptions
 * is a page Google reads neither of.
 */

/**
 * The canonical origin. Deliberately a constant rather than `page.url.origin`:
 * canonical URLs must point at production even when the page is being served
 * from a preview deployment or a bare `*.vercel.app` alias, or the previews
 * compete with the real site for the same keywords.
 */
export const SITE_URL = 'https://thunderlite.dontcode.cafe'
export const SITE_NAME = 'ThunderLite'

export const DEFAULT_TITLE =
	'ThunderLite: Free Advance Wars-Style Turn-Based Strategy in Your Browser'
export const DEFAULT_DESCRIPTION =
	'ThunderLite is a free browser rebuild of Battalion: Arena, a turn-based tactics game in the Advance Wars family. Play the campaign with no account, battle an adaptive CPU, fight live or async multiplayer on maps up to 500x500, and build your own with the map editor.'
export const DEFAULT_IMAGE = '/images/embedded-card.png'

export interface PageSeo {
	/** Page-specific title. The brand suffix is appended unless already present. */
	title?: string
	description?: string
	/** Absolute or root-relative image for og/twitter cards. */
	image?: string
	/** Override the canonical URL. Defaults to SITE_URL + the current pathname. */
	canonical?: string
	/** Keep this page out of the index (see NOINDEX_PREFIXES for the blanket rules). */
	noindex?: boolean
	/** og:type. `website` for landing pages, `article` for prose. */
	type?: 'website' | 'article'
	/** Structured data blocks, serialised into <script type="application/ld+json">. */
	jsonLd?: unknown[]
}

export interface ResolvedSeo {
	title: string
	description: string
	image: string
	canonical: string
	robots: string
	type: 'website' | 'article'
	jsonLd: unknown[]
}

/**
 * Route trees that must never be indexed. Signed-in surfaces (a lobby, someone
 * else's inbox), transient session URLs, and the dev playgrounds — all of which
 * either 302 to /login for a crawler or render a shell with no standalone value,
 * and each one that lands in the index dilutes the pages that do.
 *
 * Kept in sync with the Disallow list in /robots.txt; robots.txt stops the
 * crawl, this stops anything already crawled from being listed.
 */
export const NOINDEX_PREFIXES = [
	'/api',
	'/chat',
	'/dev',
	'/editor',
	'/games',
	'/login',
	'/logout',
	'/make',
	'/me',
	'/my',
	'/onboarding',
	'/play',
	// A finished match's replay is a URL per match forever, and a profile page is
	// a real person's name and avatar. Neither earns a search listing: replays
	// would bury the pages that rank under unbounded thin content, and profiles
	// should be reachable from inside the game rather than from a name search.
	'/replays',
	'/rooms',
	'/users',
]

export const isNoindexPath = (pathname: string): boolean =>
	NOINDEX_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

/** Root-relative paths become absolute; anything already absolute is left alone. */
export const absoluteUrl = (path: string): string => {
	if (/^https?:\/\//i.test(path)) return path
	return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** Trailing slashes are stripped so `/about` and `/about/` never self-compete. */
const canonicalFor = (pathname: string): string => {
	const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
	return absoluteUrl(trimmed)
}

const withBrand = (title: string): string =>
	title.toLowerCase().includes(SITE_NAME.toLowerCase()) ? title : `${title} | ${SITE_NAME}`

/**
 * Merge the site defaults, the blanket route rules, and whatever the page asked
 * for, into the single set of tags the layout renders.
 */
export const resolveSeo = (
	pathname: string,
	page: PageSeo | undefined,
	fallback: { title?: string; description?: string } = {}
): ResolvedSeo => {
	const noindex = page?.noindex ?? isNoindexPath(pathname)

	return {
		title: page?.title ? withBrand(page.title) : fallback.title || DEFAULT_TITLE,
		description: page?.description || fallback.description || DEFAULT_DESCRIPTION,
		image: absoluteUrl(page?.image || DEFAULT_IMAGE),
		canonical: page?.canonical ? absoluteUrl(page.canonical) : canonicalFor(pathname),
		// `max-image-preview:large` is what lets a result carry the card image,
		// and the snippet allowances are what let an AI Overview quote the page
		// instead of skipping it.
		robots: noindex
			? 'noindex, nofollow'
			: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
		type: page?.type ?? 'website',
		jsonLd: noindex ? [] : (page?.jsonLd ?? []),
	}
}
