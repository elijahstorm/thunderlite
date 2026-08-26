// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { parseCutsceneScript } from '../../src/lib/Campaign/cutsceneScript'
import { resolveRandomSpawn, asSpawn } from '../../src/lib/Campaign/randomSpawn'
import { upcomingSpawns } from '../../src/lib/Campaign/spawnTelegraph'
import { createCampaignRunner } from '../../src/lib/Campaign/campaignRunner'
import { seedFromSession, setMatchSeed } from '../../src/lib/Engine/matchSeed'
import type { CutsceneEvent } from '../../src/lib/Campaign/cutsceneTypes'

const SCRIPT = `
<turn 0,1>
random unit: 1,"Scorpion Tank"|"Lance Tank" @ 13,2|13,4|9,6|11,6
</turn>
`

const randomSpawnOf = (script = SCRIPT) => {
	const event = parseCutsceneScript(script).turns[0][1].find((e) => e.kind === 'randomSpawn')
	if (event?.kind !== 'randomSpawn') throw new Error('expected a randomSpawn')
	return event
}

// Every test that touches the salt restores the 0 default the CPU suite relies on.
afterEach(() => setMatchSeed(0))

describe('resolveRandomSpawn', () => {
	it('is stable for a given seed, so a replay reproduces the wave', () => {
		setMatchSeed(seedFromSession('match-abc'))
		const first = resolveRandomSpawn(randomSpawnOf())
		// A whole re-parse, as a mid-match reload does — same answer, because the
		// key is the source line rather than a draw counter.
		const second = resolveRandomSpawn(randomSpawnOf())
		expect(second).toEqual(first)

		setMatchSeed(seedFromSession('a-different-match'))
		const other = resolveRandomSpawn(randomSpawnOf())
		setMatchSeed(seedFromSession('match-abc'))
		expect(resolveRandomSpawn(randomSpawnOf())).toEqual(first)
		// Sanity: the seed is actually reaching the roll (one of the two axes moved).
		expect(other.unit !== first.unit || other.x !== first.x || other.y !== first.y).toBe(true)
	})

	it('always lands on one of the authored alternatives', () => {
		const event = randomSpawnOf()
		for (let i = 0; i < 200; i++) {
			setMatchSeed(i)
			const spawn = resolveRandomSpawn(event)
			expect(event.units).toContain(spawn.unit)
			expect(event.tiles).toContainEqual({ x: spawn.x, y: spawn.y })
			expect(spawn.team).toBe(event.team)
		}
	})

	it('spreads across both lists as the seed changes', () => {
		const event = randomSpawnOf()
		const seen = new Set<string>()
		for (let i = 0; i < 300; i++) {
			setMatchSeed(i)
			const s = resolveRandomSpawn(event)
			seen.add(`${s.unit}@${s.x},${s.y}`)
		}
		// 2 types x 4 tiles, rolled independently.
		expect(seen.size).toBe(8)
	})

	it('rolls each line of a multi-wave turn independently', () => {
		const twoWaves = `
<turn 0,1>
random unit: 1,"Lance Tank" @ 13,2|13,4|13,5
random unit: 1,"Lance Tank" @ 13,2|13,4|13,5
</turn>
`
		let differed = 0
		for (let i = 0; i < 100; i++) {
			setMatchSeed(i)
			const [a, b] = parseCutsceneScript(twoWaves)
				.turns[0][1].filter((e) => e.kind === 'randomSpawn')
				.map((e) => resolveRandomSpawn(e as Extract<CutsceneEvent, { kind: 'randomSpawn' }>))
			if (a.x !== b.x || a.y !== b.y) differed++
		}
		// Same list, same seed, different source lines — they must not move in lockstep.
		expect(differed).toBeGreaterThan(0)
	})

	it('takes an injected rng so a test can pin an exact outcome', () => {
		const event = randomSpawnOf()
		expect(resolveRandomSpawn(event, () => 0)).toEqual({
			kind: 'spawn',
			team: 1,
			unit: 'Scorpion Tank',
			x: 13,
			y: 2,
		})
		expect(resolveRandomSpawn(event, () => 0.999999)).toEqual({
			kind: 'spawn',
			team: 1,
			unit: 'Lance Tank',
			x: 11,
			y: 6,
		})
	})
})

describe('asSpawn', () => {
	it('passes an authored spawn through untouched and ignores other events', () => {
		const spawn: CutsceneEvent = { kind: 'spawn', team: 1, unit: 'Lance Tank', x: 1, y: 2 }
		expect(asSpawn(spawn)).toBe(spawn)
		expect(asSpawn({ kind: 'wait', seconds: 1 })).toBeNull()
	})
})

describe('telegraph and runner agree on the same roll', () => {
	it('spawns the exact unit and tile the telegraph promised', async () => {
		setMatchSeed(seedFromSession('agreement-check'))
		const script = parseCutsceneScript(SCRIPT)
		const cols = 14

		// The telegraph is computed a turn early, from its own parse of the script.
		const telegraphs = upcomingSpawns(
			parseCutsceneScript(SCRIPT),
			[{ team: 0 }, { team: 1 }],
			0,
			1,
			cols
		)
		expect(telegraphs).toHaveLength(1)

		const spawned: { team: number; unit: string; x: number; y: number }[] = []
		const panned: { x: number; y: number }[] = []
		const runner = createCampaignRunner(script, {
			camera: (x, y) => void panned.push({ x, y }),
			highlight: () => {},
			unhighlight: () => {},
			talk: () => {},
			setSpeakerColor: () => {},
			spawn: (team, unit, x, y) => void spawned.push({ team, unit, x, y }),
			kill: () => {},
			hurt: () => {},
			setTerrain: () => {},
			setWeather: () => {},
			clearWeather: () => {},
			fog: () => {},
			funds: () => {},
			addBuilding: () => {},
			removeBuilding: () => {},
			ownBuilding: () => {},
			defeat: () => {},
			wait: () => {},
		})
		await runner.enterTurn(0, 1)

		expect(spawned).toHaveLength(1)
		expect(spawned[0].y * cols + spawned[0].x).toBe(telegraphs[0].tile)
		expect(spawned[0].unit).toBe(telegraphs[0].unitName)
		// The camera follows the rolled tile, since no author could have written it.
		expect(panned).toEqual([{ x: spawned[0].x, y: spawned[0].y }])
	})
})
