// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { campaignLevels, getLevelById } from '$lib/Campaign/levels'
import { getLevelMap, getLevelMapData, getLevelScriptText } from '$lib/Campaign/levelContent'
import { parseCutsceneScript } from '$lib/Campaign/cutsceneScript'
import type { CutsceneEvent } from '$lib/Campaign/cutsceneTypes'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { terrainData } from '$lib/GameData/terrain'

const COMMAND_CENTER = buildingData.findIndex((b) => b.name === 'Command Center')
const HEAVY_COMMANDO = unitData.findIndex((u) => u.name === 'Heavy Commando')
const STRIKE_COMMANDO = unitData.findIndex((u) => u.name === 'Strike Commando')
const ANNIHILATOR = unitData.findIndex((u) => u.name === 'Annihilator Tank')

/** Every (x,y)-bearing event in a parsed script, flattened across all blocks. */
const positionedEvents = (script: ReturnType<typeof parseCutsceneScript>): CutsceneEvent[] => {
	const all: CutsceneEvent[] = [
		...script.start,
		...script.win,
		...script.lose,
		...Object.values(script.turns).flat(),
	]
	return all.filter((e) => 'x' in e && 'y' in e)
}

describe('campaign registry (K3 + K5)', () => {
	it('registers exactly 10 levels in a contiguous 1..10 order with unique ids', () => {
		expect(campaignLevels).toHaveLength(10)
		const orders = campaignLevels.map((l) => l.order).sort((a, b) => a - b)
		expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
		const ids = new Set(campaignLevels.map((l) => l.id))
		expect(ids.size).toBe(10)
	})

	it('gives every level a title and a blurb', () => {
		for (const level of campaignLevels) {
			expect(level.title.length).toBeGreaterThan(0)
			expect(level.blurb.length).toBeGreaterThan(0)
		}
	})
})

describe.each(campaignLevels.map((l) => [l.id, l] as const))('level %s', (id, level) => {
	it('has a registry entry resolvable by id', () => {
		expect(getLevelById(id)).toBe(level)
	})

	it('ships a map with both sides and only valid types/positions', () => {
		const map = getLevelMap(id)
		const data = getLevelMapData(id)
		expect(map).not.toBeNull()
		expect(data).not.toBeNull()
		if (!map || !data) return

		const tiles = map.cols * map.rows
		expect(data.layers.ground).toHaveLength(tiles)

		const teams = new Set<number>()
		for (const u of data.layers.units) {
			expect(u.type).toBeGreaterThanOrEqual(0)
			expect(u.type).toBeLessThan(unitData.length)
			expect(u.l).toBeGreaterThanOrEqual(0)
			expect(u.l).toBeLessThan(tiles)
			teams.add(u.team)
		}
		for (const b of data.layers.buildings) {
			expect(b.type).toBeGreaterThanOrEqual(0)
			expect(b.type).toBeLessThan(buildingData.length)
			expect(b.l).toBeLessThan(tiles)
			teams.add(b.team)
		}
		// A genuine match needs at least the player (0) and one opponent (1).
		expect(teams.has(0)).toBe(true)
		expect(teams.has(1)).toBe(true)
	})

	it('has a script with start, win, lose, and at least one turn beat', () => {
		const text = getLevelScriptText(id)
		expect(text).not.toBeNull()
		const script = parseCutsceneScript(text as string)
		expect(script.start.length).toBeGreaterThan(0)
		expect(script.win.length).toBeGreaterThan(0)
		expect(script.lose.length).toBeGreaterThan(0)
		expect(Object.keys(script.turns).length).toBeGreaterThanOrEqual(1)
	})

	it('only references on-board coordinates and known terrain in its script', () => {
		const map = getLevelMap(id)
		const script = parseCutsceneScript(getLevelScriptText(id) as string)
		if (!map) return
		for (const event of positionedEvents(script)) {
			const e = event as Extract<CutsceneEvent, { x: number; y: number }>
			expect(e.x).toBeGreaterThanOrEqual(0)
			expect(e.x).toBeLessThan(map.cols)
			expect(e.y).toBeGreaterThanOrEqual(0)
			expect(e.y).toBeLessThan(map.rows)
			if (event.kind === 'setTerrain') {
				expect(terrainData.some((t) => t.name === event.terrain)).toBe(true)
			}
		}
	})
})

// Acceptance: levels 1-3 introduce move/attack, capture, and armor matchups (smoke-checkable).
describe('tutorial beats (levels 1-3)', () => {
	const unitsOf = (id: string, team: number): number[] =>
		(getLevelMapData(id)?.layers.units ?? []).filter((u) => u.team === team).map((u) => u.type)
	const buildingsOf = (id: string, team: number): number[] =>
		(getLevelMapData(id)?.layers.buildings ?? []).filter((b) => b.team === team).map((b) => b.type)

	it('level 1 sets up the weapon-vs-armor matchup: player heavy gun vs enemy light armor', () => {
		const player = unitsOf('01-first-contact', 0)
		const enemy = unitsOf('01-first-contact', 1)
		expect(player).toContain(HEAVY_COMMANDO)
		// Strike Commandos are light-armored — the matchup the heavy gun exploits.
		expect(enemy).toContain(STRIKE_COMMANDO)
		expect(enemy.every((t) => unitData[t].armorType === 'light')).toBe(true)
	})

	it('level 2 teaches capture: the enemy fields a capturable Command Center', () => {
		expect(buildingsOf('02-hold-the-line', 1)).toContain(COMMAND_CENTER)
		// The player has a capture-capable unit to take it.
		const player = unitsOf('02-hold-the-line', 0)
		const canCapture = player.some((t) =>
			unitData[t].modifiers.some((m) => m.startsWith('Start_Turn.Capture'))
		)
		expect(canCapture).toBe(true)
	})

	it('level 3 teaches the heavy/light armor problem: enemy heavy armor vs player heavy weapons', () => {
		const player = unitsOf('03-heavy-metal', 0)
		const enemy = unitsOf('03-heavy-metal', 1)
		expect(enemy).toContain(ANNIHILATOR)
		expect(unitData[ANNIHILATOR].armorType).toBe('heavy')
		// The player must bring heavy weapons to dent it.
		expect(player.some((t) => unitData[t].weaponType === 'heavy')).toBe(true)
	})
})
