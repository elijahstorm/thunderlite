import { describe, expect, it } from 'vitest'
import { mergeTraceSources, parseTraceArchive, tracePath } from '../../src/lib/Game/traceArchive'

describe('trace archive', () => {
	it('names one private object per client per room', () => {
		expect(tracePath('room', 'abc')).toBe('traces/room/abc.json')
	})

	it('parses an archive and normalises its entries', () => {
		const archive = parseTraceArchive(
			JSON.stringify({
				entries: [
					{ kind: 'in', eventId: 3, ts: 10, detail: { via: 'push' } },
					{ kind: 'note', eventId: 'x', ts: '11', detail: { note: 'joined' } },
					null,
				],
				dropped: '2',
			})
		)
		expect(archive).toEqual({
			entries: [
				{ kind: 'in', eventId: 3, ts: 10, detail: { via: 'push' } },
				{ kind: 'note', eventId: -1, ts: 11, detail: { note: 'joined' } },
			],
			dropped: 2,
		})
	})

	it('reads anything malformed as no archive', () => {
		expect(parseTraceArchive(null)).toBeNull()
		expect(parseTraceArchive('not json')).toBeNull()
		expect(parseTraceArchive('{"entries": "nope"}')).toBeNull()
	})

	it('merges rows and archives into one chronological, renumbered trace', () => {
		const rows = [
			{ userSession: 'a', kind: 'desync', eventId: 5, detail: {}, ts: 50 },
			{ userSession: 'b', kind: 'in', eventId: 1, detail: {}, ts: 10 },
		]
		const archives = [
			{
				userSession: 'a',
				archive: {
					entries: [
						{ kind: 'in', eventId: 1, ts: 10, detail: {} },
						{ kind: 'in', eventId: 2, ts: 20, detail: {} },
					],
				},
			},
		]
		const merged = mergeTraceSources(rows, archives)
		expect(merged.map((e) => [e.id, e.userSession, e.kind, e.ts, e.source])).toEqual([
			[0, 'b', 'in', 10, 'row'],
			[1, 'a', 'in', 10, 'archive'],
			[2, 'a', 'in', 20, 'archive'],
			[3, 'a', 'desync', 50, 'row'],
		])
	})

	it('keeps recorded order for entries in the same millisecond', () => {
		const merged = mergeTraceSources(
			[],
			[
				{
					userSession: 'a',
					archive: {
						entries: [
							{ kind: 'out', eventId: 1, ts: 7, detail: { n: 1 } },
							{ kind: 'perf', eventId: 1, ts: 7, detail: { n: 2 } },
							{ kind: 'state', eventId: 1, ts: 7, detail: { n: 3 } },
						],
					},
				},
			]
		)
		expect(merged.map((e) => (e.detail as { n: number }).n)).toEqual([1, 2, 3])
	})
})
