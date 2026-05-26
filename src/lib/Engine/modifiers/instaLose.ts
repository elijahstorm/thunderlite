import { buildingData } from '$lib/GameData/building'
import { unitData } from '$lib/GameData/unit'
import { gameState } from '$lib/Engine/gameState'
import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'

const buildingTypeByName = (name: string): number => {
	const idx = buildingData.findIndex((b) => b.name === name)
	if (idx < 0) throw new Error(`instaLose: missing building "${name}"`)
	return idx
}

const COMMAND_CENTER_TYPE = buildingTypeByName('Command Center')

const unitHasInstaLose = (unitType: number): boolean => {
	const data = unitData[unitType]
	if (!data) return false
	return data.modifiers.includes('Death.Insta_Lose')
}

export const playerHasOtherInstaLoseUnit = (
	map: MapObject | MapProcesser,
	team: number,
	excludeTile?: number
): boolean => {
	for (let tile = 0; tile < map.layers.units.length; tile++) {
		if (tile === excludeTile) continue
		const unit = map.layers.units[tile]
		if (!unit) continue
		if (unit.team !== team) continue
		if (unitHasInstaLose(unit.type)) return true
	}
	return false
}

export const playerHasCommandCenter = (map: MapObject | MapProcesser, team: number): boolean => {
	for (const building of map.layers.buildings) {
		if (!building) continue
		if (building.team !== team) continue
		if (building.type === COMMAND_CENTER_TYPE) return true
	}
	return false
}

export const markPlayerLost = (team: number): void => {
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => (p.team === team ? { ...p, hasLost: true } : p)),
	}))
}

export const instaLose: ModifierHandler = (target: ModifierTarget, ctx: ModifierContext): void => {
	if (ctx.kind !== 'unit') return
	if (!ctx.map) return

	const unit = target as UnitObject
	const team = unit.team
	if (typeof team !== 'number') return

	if (playerHasOtherInstaLoseUnit(ctx.map, team, ctx.tile)) return
	if (playerHasCommandCenter(ctx.map, team)) return

	markPlayerLost(team)
}
