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
// A standalone pointer to the last saved map the user was editing. Lets a blank
// editor (the bare /editor route) reopen that map so edits keep flowing to the
// same row instead of forking a duplicate on the next save.
const LAST_KEY = 'thunderlite:editor-last-map:v1'
const NEW_SLOT = 'new'

const slot = (id?: string) => id ?? NEW_SLOT

// `mapId` links a draft back to its saved map (`public_id`) so a recovered draft
// keeps saving in place. The compact map hash omits the title (see
// mapExporter#filter), so it rides along here and is restored on recovery.
type Draft = { hash: string; title: string; savedAt: number; mapId?: string }
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
export const loadDraft = (
	id?: string
): { map: MapObject; hash: string; savedAt: number; mapId?: string } | null => {
	if (!browser) return null
	const draft = readAll()[slot(id)]
	if (!draft) return null
	try {
		const map = deriveFromHash(draft.hash)
		// The hash doesn't carry the title, so restore it or a recovered map would
		// come back as the exporter's placeholder name.
		if (draft.title) map.title = draft.title
		return { map, hash: draft.hash, savedAt: draft.savedAt, mapId: draft.mapId }
	} catch {
		return null
	}
}

export const saveDraft = (map: MapObject, id?: string) => {
	if (!browser) return
	const drafts = readAll()
	drafts[slot(id)] = {
		hash: mapHasher(map),
		title: map.title ?? '',
		savedAt: Date.now(),
		mapId: id,
	}
	writeAll(drafts)
	// Backing up a draft for a saved map also marks it as the last one worked on.
	if (id) setLastActiveMapId(id)
}

export const clearDraft = (id?: string) => {
	if (!browser) return
	const drafts = readAll()
	delete drafts[slot(id)]
	writeAll(drafts)
}

/** Remember which saved map the editor was last working on (see {@link LAST_KEY}). */
export const setLastActiveMapId = (id: string) => {
	if (!browser) return
	try {
		localStorage.setItem(LAST_KEY, id)
	} catch {
		// Storage disabled/full — losing the resume pointer is non-fatal.
	}
}

/** The last saved map the editor was working on, or null when there's none. */
export const getLastActiveMapId = (): string | null => {
	if (!browser) return null
	try {
		return localStorage.getItem(LAST_KEY)
	} catch {
		return null
	}
}

export const clearLastActiveMapId = () => {
	if (!browser) return
	try {
		localStorage.removeItem(LAST_KEY)
	} catch {
		// no-op
	}
}
