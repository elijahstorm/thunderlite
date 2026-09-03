/**
 * Where a client's archived match trace lives, and how the incident rows in
 * `game_log` and the archives in storage read back as one trace.
 *
 * Two sources because they answer different needs. The archive is the whole
 * match from one client's point of view, uploaded once at the end into private
 * storage. The rows are the moments that could not wait for the end: a desync,
 * a refused relay, a resync, the tab closing mid-match. A healthy match has an
 * archive and no rows; a match that broke before its end has rows and no
 * archive; most broken matches have both, with the rows duplicating a slice of
 * what the archive holds. The merge keeps everything and lets the reader's own
 * dedupe (same client, same event id, same digest) do the rest.
 */

export type TraceEntry = {
	userSession: string
	kind: string
	eventId: number
	detail: unknown
	ts: number
}

/** Private-storage object for one client's trace of one room. */
export const tracePath = (session: string, userSession: string): string =>
	`traces/${session}/${userSession}.json`

/** Shape a client uploads: its whole recorder archive. */
export type TraceArchive = {
	entries: { kind: string; eventId: number; ts: number; detail: unknown }[]
	dropped?: number
}

/** Parse an archive body defensively; anything malformed reads as empty. */
export const parseTraceArchive = (body: string | null): TraceArchive | null => {
	if (!body) return null
	try {
		const parsed = JSON.parse(body) as unknown
		const entries = (parsed as { entries?: unknown })?.entries
		if (!Array.isArray(entries)) return null
		return {
			entries: entries
				.filter((e): e is TraceArchive['entries'][number] => !!e && typeof e === 'object')
				.map((e) => ({
					kind: String(e.kind),
					eventId: Number.isInteger(e.eventId) ? Number(e.eventId) : -1,
					ts: Number(e.ts) || 0,
					detail: e.detail ?? {},
				})),
			dropped: Number((parsed as { dropped?: unknown })?.dropped) || 0,
		}
	} catch {
		return null
	}
}

/**
 * One chronological trace from both sources. Stable on `ts` so entries written
 * in the same millisecond keep their recorded order, then re-numbered so `id`
 * is a position a reader can point at.
 */
export const mergeTraceSources = (
	rows: TraceEntry[],
	archives: { userSession: string; archive: TraceArchive }[]
): (TraceEntry & { id: number; source: 'row' | 'archive' })[] => {
	const all: (TraceEntry & { source: 'row' | 'archive' })[] = rows.map((r) => ({
		...r,
		source: 'row' as const,
	}))
	for (const { userSession, archive } of archives) {
		for (const e of archive.entries) {
			all.push({
				userSession,
				kind: e.kind,
				eventId: e.eventId,
				detail: e.detail,
				ts: e.ts,
				source: 'archive',
			})
		}
	}
	return all
		.map((e, order) => ({ e, order }))
		.sort((a, b) => a.e.ts - b.e.ts || a.order - b.order)
		.map(({ e }, id) => ({ ...e, id }))
}
