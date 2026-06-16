/**
 * levels — the ordered registry of single-player campaign levels (K3 + K5).
 *
 * K3 owns the *shape* and *ordering*; K5 fills it with the 10 authored levels.
 * Each level's board (`NN-slug.json`) and script (`NN-slug.txt`) live under
 * `./levels/` and are bundled by `levelContent.ts`, keyed by the level `id`
 * (which is the file stem). `order` is the 1-based campaign position and the
 * unit the unlock logic works in: beating order N unlocks order N+1.
 *
 * The progression subscriber (`progress.ts`) and the level-select UI (K4) both
 * read this list; neither hard-codes a level count, so the list can grow freely.
 */

export interface CampaignLevel {
	/** Stable id used by `MatchResult.campaignLevelId`, unlock lookups, and as
	 * the `./levels/<id>.{json,txt}` file stem. */
	id: string
	/** 1-based position in the campaign; the unit the unlock rule advances in. */
	order: number
	/** Human-readable level title shown in level select. */
	title: string
	/** One-line tagline / what the level teaches, shown on the level card. */
	blurb: string
}

/**
 * The 10 authored levels telling the Reyes / Vance / Kael story.
 * Each `id` is the stem of the matching `./levels/<id>.json` map and
 * `./levels/<id>.txt` script. Tune balance and prose in those files; the unlock
 * logic never needs to change.
 */
export const campaignLevels: readonly CampaignLevel[] = [
	{
		id: '01-first-contact',
		order: 1,
		title: 'First Contact',
		blurb: 'Move, attack, and the armor matchup',
	},
	{
		id: '02-hold-the-line',
		order: 2,
		title: 'Hold the Line',
		blurb: 'Capture — and why the capital is everything',
	},
	{
		id: '03-heavy-metal',
		order: 3,
		title: 'Heavy Metal',
		blurb: 'Heavy vs light armor, and counter-attacks',
	},
	{
		id: '04-trench-warfare',
		order: 4,
		title: 'Trench Warfare',
		blurb: 'Terrain defense — dig in and outlast',
	},
	{
		id: '05-fog-of-war',
		order: 5,
		title: 'Fog of War',
		blurb: 'Sight, cloak, and the Jammer Truck',
	},
	{
		id: '06-supply-lines',
		order: 6,
		title: 'Supply Lines',
		blurb: 'Treasury, income, and the build menu',
	},
	{
		id: '07-rolling-thunder',
		order: 7,
		title: 'Rolling Thunder',
		blurb: 'Indirect fire and range',
	},
	{ id: '08-storm-front', order: 8, title: 'Storm Front', blurb: 'Weather slows the advance' },
	{
		id: '09-the-stronghold',
		order: 9,
		title: 'The Stronghold',
		blurb: 'Combined arms vs the Warmachine',
	},
	{
		id: '10-final-standoff',
		order: 10,
		title: 'Final Standoff',
		blurb: 'Everything you have learned',
	},
] as const

/** Lowest campaign order — what a brand-new player starts with unlocked. */
export const firstLevelOrder: number = campaignLevels.reduce(
	(min, level) => Math.min(min, level.order),
	campaignLevels[0]?.order ?? 1
)

/** Highest campaign order — the cap the unlock rule never exceeds. */
export const lastLevelOrder: number = campaignLevels.reduce(
	(max, level) => Math.max(max, level.order),
	campaignLevels[0]?.order ?? 1
)

/** Find a level by id (used by unlock lookups and the match-end subscriber). */
export const getLevelById = (id: string): CampaignLevel | undefined =>
	campaignLevels.find((level) => level.id === id)

/** Find a level by its campaign order (used by level select / auto-advance). */
export const getLevelByOrder = (order: number): CampaignLevel | undefined =>
	campaignLevels.find((level) => level.order === order)
