/**
 * Structured data. This is the half of the work that answer engines actually
 * read: an AI Overview or a Perplexity citation is built from an entity it can
 * name, and schema.org is how the page states "I am a free browser game called
 * ThunderLite" without relying on a model inferring it from marketing prose.
 *
 * Every claim below is one the site can back up. Nothing here invents a rating,
 * a review count, or a release date, because a schema block contradicting the
 * page is worse than no schema block.
 */
import { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION, absoluteUrl } from './seo'

const REPO_URL = 'https://github.com/elijahstorm/thunderlite'

/** Stable @id values so the graph nodes reference each other instead of duplicating. */
export const IDS = {
	site: `${SITE_URL}/#website`,
	game: `${SITE_URL}/#game`,
	author: `${SITE_URL}/#author`,
}

export const authorJsonLd = () => ({
	'@type': 'Person',
	'@id': IDS.author,
	name: 'Elijah Storm',
	url: 'https://github.com/elijahstorm',
	sameAs: ['https://github.com/elijahstorm'],
})

export const websiteJsonLd = () => ({
	'@type': 'WebSite',
	'@id': IDS.site,
	url: `${SITE_URL}/`,
	name: SITE_NAME,
	description: DEFAULT_DESCRIPTION,
	inLanguage: 'en',
	publisher: { '@id': IDS.author },
})

/**
 * The primary entity. `VideoGame` is a `SoftwareApplication` subtype, so the
 * offer/platform fields are the ones a "free browser strategy game" query is
 * matched against, and `isAccessibleForFree` is the field that makes the free
 * claim machine-checkable rather than a marketing adjective.
 */
export const videoGameJsonLd = () => ({
	'@type': 'VideoGame',
	'@id': IDS.game,
	name: SITE_NAME,
	alternateName: 'ThunderLite Tactics',
	url: `${SITE_URL}/`,
	description: DEFAULT_DESCRIPTION,
	image: absoluteUrl('/images/embedded-card.png'),
	inLanguage: 'en',
	applicationCategory: 'GameApplication',
	applicationSubCategory: 'Turn-Based Strategy',
	genre: ['Turn-based tactics', 'Strategy', 'Wargame'],
	gamePlatform: ['Web browser', 'PC', 'Mobile web'],
	operatingSystem: 'Any (runs in a web browser, no install)',
	browserRequirements: 'Requires a modern browser with JavaScript enabled.',
	playMode: ['SinglePlayer', 'MultiPlayer'],
	numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 4 },
	isAccessibleForFree: true,
	author: { '@id': IDS.author },
	publisher: { '@id': IDS.author },
	isPartOf: { '@id': IDS.site },
	codeRepository: REPO_URL,
	sameAs: [REPO_URL],
	offers: {
		'@type': 'Offer',
		price: '0',
		priceCurrency: 'USD',
		availability: 'https://schema.org/InStock',
		url: `${SITE_URL}/`,
	},
	featureList: [
		'Single player campaign playable with no account',
		'Adaptive CPU opponent that reacts to how you play',
		'Live multiplayer and async correspondence matches',
		'Maps up to 500x500 tiles',
		'Terrain height, line of sight, fog of war, and weather',
		'Map editor with scriptable events and community publishing',
		'Ranked ELO, match history, and replays',
	],
})

export const faqJsonLd = (items: { q: string; a: string }[]) => ({
	'@type': 'FAQPage',
	mainEntity: items.map(({ q, a }) => ({
		'@type': 'Question',
		name: q,
		acceptedAnswer: { '@type': 'Answer', text: a },
	})),
})

export const breadcrumbJsonLd = (trail: { name: string; path: string }[]) => ({
	'@type': 'BreadcrumbList',
	itemListElement: trail.map(({ name, path }, index) => ({
		'@type': 'ListItem',
		position: index + 1,
		name,
		item: absoluteUrl(path),
	})),
})

export const articleJsonLd = (input: {
	headline: string
	description: string
	path: string
	datePublished: string
	dateModified?: string
}) => ({
	'@type': 'Article',
	headline: input.headline,
	description: input.description,
	mainEntityOfPage: absoluteUrl(input.path),
	datePublished: input.datePublished,
	dateModified: input.dateModified ?? input.datePublished,
	author: { '@id': IDS.author },
	publisher: { '@id': IDS.author },
	image: absoluteUrl('/images/embedded-card.png'),
	about: { '@id': IDS.game },
})

/**
 * Wrap the per-page nodes in one `@graph` so the whole page ships a single
 * ld+json script and the `@id` cross-references resolve.
 */
export const graph = (nodes: unknown[]) => ({
	'@context': 'https://schema.org',
	'@graph': nodes,
})
