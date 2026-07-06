import { browser } from '$app/environment'
import { deriveFromHash, mapHasher } from './mapExporter'

/**
 * Crash-safety autosave for the map editor. The working draft is serialized to
 * the same compact base62 hash the exporter already produces and stashed in
 * localStorage, so an accidental reload or a browser crash can't lose unsaved
 * work — it's recovered the next time that editing context opens.
 *
 * Drafts are keyed by the map's saved id (or a shared `new` slot for a map that
 * hasn't been saved yet), so editing two different maps never clobbers the
 * other's backup. This is a best-effort backup, not durable storage: every
 * access is wrapped so a disabled/full localStorage degrades to "no autosave"
 * rather than throwing into the editor.
 */

const KEY = 'thunderlite:editor-drafts:v1'
const NEW_SLOT = 'new'

const slot = (id?: string) => id ?? NEW_SLOT

type Draft = { hash: string; title: string; savedAt: number }
type Drafts = Record<string, Draft>

const readAll = (): Drafts => {
	if (!browser) return {}
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Drafts
	} catch {
		return {}
	}
}

const writeAll = (drafts: Drafts) => {
	try {
		localStorage.setItem(KEY, JSON.stringify(drafts))
	} catch {
		// Quota exceeded / storage disabled — a lost autosave is non-fatal.
	}
}

/**
 * The recovered map for this editing context, or null when there's no backup
 * (or it can't be parsed). `hash` is returned alongside so the caller can cheaply
 * tell whether the draft actually differs from what it's about to load.
 */
export const loadDraft = (id?: string): { map: MapObject; hash: string; savedAt: number } | null => {
	if (!browser) return null
	const draft = readAll()[slot(id)]
	if (!draft) return null
	try {
		return { map: deriveFromHash(draft.hash), hash: draft.hash, savedAt: draft.savedAt }
	} catch {
		return null
	}
}

export const saveDraft = (map: MapObject, id?: string) => {
	if (!browser) return
	const drafts = readAll()
	drafts[slot(id)] = { hash: mapHasher(map), title: map.title ?? '', savedAt: Date.now() }
	writeAll(drafts)
}

export const clearDraft = (id?: string) => {
	if (!browser) return
	const drafts = readAll()
	delete drafts[slot(id)]
	writeAll(drafts)
}
