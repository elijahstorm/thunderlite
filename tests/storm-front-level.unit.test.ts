// Throwaway-style validation for the 08-storm-front redesign: the script must
// parse through the real cutscene parser and every JSON placement must satisfy
// the engine's own placement rules. Kept as a test so regressions surface.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseCutsceneScript } from '../src/lib/Campaign/cutsceneScript'
import { deriveFromData } from '../src/lib/Map/Editor/mapExporter'
import { canPlaceUnit } from '../src/lib/Engine/Interactor/Pathing/movement'
import { unitData } from '../src/lib/GameData/unit'
import { buildingData } from '../src/lib/GameData/building'
import { terrainData } from '../src/lib/GameData/terrain'
import { skyData } from '../src/lib/GameData/sky'

const json = JSON.parse(readFileSync('src/lib/Campaign/levels/08-storm-front.json', 'utf-8')) as {
	cols: number
	rows: number
	layers: {
		ground: { type: number }[]
		sky: { type: number; l: number }[]
		units: { type: number; team: number; l: number; health?: number }[]
		buildings: { type: number; team: number; l: number }[]
	}
}
const script = readFileSync('src/lib/Campaign/levels/08-storm-front.txt', 'utf-8')

describe('08-storm-front map', () => {
	it('has a full ground layer and in-bounds sparse layers', () => {
		const size = json.cols * json.rows
		expect(json.layers.ground.length).toBe(size)
		for (const layer of [json.layers.sky, json.layers.units, json.layers.buildings]) {
			for (const e of layer) {
				expect(e.l).toBeGreaterThanOrEqual(0)
				expect(e.l).toBeLessThan(size)
			}
		}
		for (const t of json.layers.ground) expect(terrainData[t.type]).toBeDefined()
		for (const s of json.layers.sky) expect(skyData[s.type]).toBeDefined()
	})

	it('places every unit on terrain it could legally occupy', () => {
		for (const u of json.layers.units) {
			const terrain = json.layers.ground[u.l] as GroundObject
			const unit = { type: u.type, team: u.team, state: 0 } as UnitObject
			expect(canPlaceUnit(terrain, unit), `unit ${unitData[u.type].name} at l=${u.l}`).toBe(true)
		}
	})

	it('never stacks units, buildings on impassable ground, or units on buildings', () => {
		const unitTiles = json.layers.units.map((u) => u.l)
		expect(new Set(unitTiles).size).toBe(unitTiles.length)
		const buildingTiles = new Set(json.layers.buildings.map((b) => b.l))
		expect(buildingTiles.size).toBe(json.layers.buildings.length)
		for (const b of json.layers.buildings) {
			expect(buildingData[b.type]).toBeDefined()
			expect(terrainData[json.layers.ground[b.l].type].details).not.toBe('impassable')
		}
		for (const l of unitTiles) expect(buildingTiles.has(l)).toBe(false)
	})

	it('gives the player a starting Vulture Drone and no air control until captured', () => {
		const vulture = unitData.findIndex((u) => u.name === 'Vulture Drone')
		expect(json.layers.units.some((u) => u.team === 0 && u.type === vulture)).toBe(true)
		const airControl = buildingData.findIndex((b) => b.name === 'Air Control')
		const playerAir = json.layers.buildings.filter((b) => b.team === 0 && b.type === airControl)
		expect(playerAir.length).toBe(0)
		const neutralAir = json.layers.buildings.filter((b) => b.team === 4 && b.type === airControl)
		expect(neutralAir.length).toBe(2)
	})

	it('script parses and only references real unit/weather names', () => {
		const parsed = parseCutsceneScript(script)
		expect(parsed).toBeTruthy()
	})

	it('hydrates authored cargo and health through the real loader', () => {
		const map = deriveFromData(json as unknown as MapData)
		const transporterType = unitData.findIndex((u) => u.name === 'Transporter')
		const transporter = map.layers.units.find((u) => u?.type === transporterType)
		expect(transporter?.rescuedUnit?.type).toBe(
			unitData.findIndex((u) => u.name === 'Strike Commando')
		)
		expect(transporter?.rescuedUnit?.team).toBe(0)
		const hurt = json.layers.units.find((u) => u.health != null)
		expect(hurt).toBeTruthy()
		expect(map.layers.units[hurt!.l]?.health).toBe(hurt!.health)
	})
})
