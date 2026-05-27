/**
 * levels — the ordered registry of single-player campaign levels (K3).
 *
 * This card owns the *shape* and the *ordering* only; the real maps and scripts
 * land in K5. Each descriptor names a map (`mapSha`, the same content hash the
 * map editor/loader keys off) and a scripted cutscene file (`scriptPath`, parsed
 * by K1's `parseCutsceneScript`). `order` is the 1-based campaign position and is
 * the unit the unlock logic works in: beating order N unlocks order N+1.
 *
 * The progression subscriber (`progress.ts`) and the level-select UI (K4) both
 * read this list; neither hard-codes a level count, so K5 can grow it freely.
 */

export interface CampaignLevel {
	/** Stable id used by `MatchResult.campaignLevelId` and unlock lookups. */
	id: string
	/** 1-based position in the campaign; the unit the unlock rule advances in. */
	order: number
	/** Human-readable level title shown in level select. */
	title: string
	/** Content hash of the level's map (resolved by the map loader). */
	mapSha: string
	/** Path to the K1 cutscene/level script driving this level. */
	scriptPath: string
}

/**
 * Stub list — placeholder maps/scripts reusing the original Link / Torrial /
 * Gannon story beats. K5 replaces the `mapSha`/`scriptPath` values (and may add
 * the remaining levels) without touching the unlock logic.
 */
export const campaignLevels: readonly CampaignLevel[] = [
	{ id: 'k-01-awakening', order: 1, title: 'Awakening', mapSha: '', scriptPath: '' },
	{ id: 'k-02-first-blood', order: 2, title: 'First Blood', mapSha: '', scriptPath: '' },
	{ id: 'k-03-the-pass', order: 3, title: 'The Pass', mapSha: '', scriptPath: '' },
	{ id: 'k-04-gannons-gate', order: 4, title: "Gannon's Gate", mapSha: '', scriptPath: '' },
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
