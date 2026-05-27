/**
 * levelContent — bundles the authored campaign level files (K5).
 *
 * Each level is two files under `./levels/`:
 *   - `NN-slug.json` — the board in the editor's `MapData` format.
 *   - `NN-slug.txt`  — the K1 cutscene/level script.
 *
 * Both are pulled in at build time with `import.meta.glob` (eager) and keyed by
 * the file stem, which is also the level `id` in `levels.ts`. Bundling (rather
 * than `fetch`) keeps the content available synchronously and lets the whole
 * thing run headless in vitest — the mission's "game-logic modules must run
 * headless" rule — so a unit test can assert every level's script parses and
 * its map has two sides.
 */

import { deriveFromData } from '$lib/Map/Editor/mapExporter'

const scriptModules = import.meta.glob('./levels/*.txt', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>

const mapModules = import.meta.glob('./levels/*.json', {
	import: 'default',
	eager: true,
}) as Record<string, MapData>

/** `./levels/01-first-contact.txt` → `01-first-contact`. */
const stemOf = (path: string): string => path.replace(/^.*\//, '').replace(/\.[^.]+$/, '')

const byStem = <T>(modules: Record<string, T>): Record<string, T> => {
	const out: Record<string, T> = {}
	for (const [path, value] of Object.entries(modules)) out[stemOf(path)] = value
	return out
}

const scriptsByStem = byStem(scriptModules)
const mapsByStem = byStem(mapModules)

/** Raw K1 script text for a level id, or `null` when no `.txt` is authored. */
export const getLevelScriptText = (id: string): string | null => scriptsByStem[id] ?? null

/** Parsed `MapData` for a level id, or `null` when no `.json` is authored. */
export const getLevelMapData = (id: string): MapData | null => mapsByStem[id] ?? null

/** Runtime board for a level id, or `null` when no `.json` is authored. */
export const getLevelMap = (id: string): MapObject | null => {
	const data = mapsByStem[id]
	return data ? deriveFromData(data) : null
}

/** Every level id that has at least one authored file (map or script). */
export const authoredLevelIds = (): string[] =>
	[...new Set([...Object.keys(mapsByStem), ...Object.keys(scriptsByStem)])].sort()
