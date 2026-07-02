// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseCutsceneScript } from '../../src/lib/Campaign/cutsceneScript'
import { upcomingSpawns, type TelegraphPlayer } from '../../src/lib/Campaign/spawnTelegraph'
import { unitData } from '../../src/lib/GameData/unit'

const COLS = 10
const STRIKE = unitData.findIndex((u) => u.name === 'Strike Commando')
const SCORPION = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const tileOf = (x: number, y: number) => y * COLS + x

// team 0's reinforcement lands on round 1; team 1's on round 0.
const SCRIPT = parseCutsceneScript(`
<turn 1,0>
add unit: 0,"Strike Commando",3,2
</turn>

<turn 0,1>
add unit: 1,"Scorpion Tank",5,4
</turn>
`)

const TWO_PLAYERS: TelegraphPlayer[] = [{ team: 0 }, { team: 1 }]

describe('upcomingSpawns', () => {
	it("during team 0's turn, telegraphs team 1's this-round drop AND team 0's next-round drop", () => {
		// currentTeam 0, round 0 (turnNumber 1). Team 1 acts later this round; team 0 next round.
		const result = upcomingSpawns(SCRIPT, TWO_PLAYERS, 0, 1, COLS)

		expect(result).toEqual(
			expect.arrayContaining([
				{ tile: tileOf(3, 2), team: 0, unitType: STRIKE, unitName: 'Strike Commando' },
				{ tile: tileOf(5, 4), team: 1, unitType: SCORPION, unitName: 'Scorpion Tank' },
			])
		)
		expect(result).toHaveLength(2)
	})

	it("does not re-telegraph a block that already fired on the current team's turn", () => {
		// currentTeam 1, round 0: team 1's <turn 0,1> is firing now, so it's in the past.
		// Its next turn is round 1 (<turn 1,1>, which doesn't exist) → nothing for team 1.
		// Team 0's next turn is round 1 → its Strike Commando is still ahead.
		const result = upcomingSpawns(SCRIPT, TWO_PLAYERS, 1, 1, COLS)

		expect(result).toEqual([
			{ tile: tileOf(3, 2), team: 0, unitType: STRIKE, unitName: 'Strike Commando' },
		])
	})

	it('skips eliminated teams (they take no further turns)', () => {
		const result = upcomingSpawns(SCRIPT, [{ team: 0 }, { team: 1, hasLost: true }], 0, 1, COLS)

		// Team 1 is out, so only team 0's next-round drop remains.
		expect(result).toEqual([
			{ tile: tileOf(3, 2), team: 0, unitType: STRIKE, unitName: 'Strike Commando' },
		])
	})

	it('returns nothing when the next turn blocks hold no spawns', () => {
		const noSpawns = parseCutsceneScript(`
<turn 1,0>
talk Vance: "Hold the line."
</turn>
`)
		expect(upcomingSpawns(noSpawns, TWO_PLAYERS, 0, 1, COLS)).toEqual([])
	})

	it('resolves `<turn N>` shorthand to team 0', () => {
		const shorthand = parseCutsceneScript(`
<turn 1>
add unit: 0,"Strike Commando",7,1
</turn>
`)
		// Round 0, team 0 → its next turn is round 1 → the shorthand block.
		expect(upcomingSpawns(shorthand, TWO_PLAYERS, 0, 1, COLS)).toEqual([
			{ tile: tileOf(7, 1), team: 0, unitType: STRIKE, unitName: 'Strike Commando' },
		])
	})

	it('returns nothing with no players', () => {
		expect(upcomingSpawns(SCRIPT, [], 0, 1, COLS)).toEqual([])
	})
})
