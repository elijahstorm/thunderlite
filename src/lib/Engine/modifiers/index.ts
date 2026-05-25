import { modifierData, type ModifierPhase } from '$lib/GameData/modifier'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import type { GameState } from '$lib/Engine/gameState'

export type ModifierKey = keyof typeof modifierData

export type { ModifierPhase }

export type ModifierTargetKind = 'unit' | 'building'

export type ModifierContext = {
	kind: ModifierTargetKind
	tile: number
	state: GameState
	map?: MapObject | MapProcesser
	previousTeam?: number
}

export type ModifierTarget = UnitObject | BuildingObject

export type ModifierHandler = (target: ModifierTarget, ctx: ModifierContext) => void

const registry = new Map<ModifierKey, ModifierHandler[]>()

export const registerModifier = (key: ModifierKey, handler: ModifierHandler): void => {
	const existing = registry.get(key)
	if (existing) {
		existing.push(handler)
	} else {
		registry.set(key, [handler])
	}
}

export const clearModifierRegistry = (): void => {
	registry.clear()
}

const getModifiersForTarget = (
	target: ModifierTarget,
	kind: ModifierTargetKind
): readonly ModifierKey[] => {
	const table = kind === 'unit' ? unitData : buildingData
	const entry = table[target.type]
	return entry?.modifiers ?? []
}

const getPhase = (key: ModifierKey): ModifierPhase | undefined => modifierData[key]?.phase

export const runModifiers = (
	target: ModifierTarget,
	phase: ModifierPhase,
	ctx: ModifierContext
): void => {
	const modifiers = getModifiersForTarget(target, ctx.kind)
	for (const key of modifiers) {
		if (getPhase(key) !== phase) continue

		const builtIn = modifierData[key]?.run
		if (builtIn) builtIn(target, ctx)

		const handlers = registry.get(key)
		if (!handlers) continue
		for (const handler of handlers) {
			handler(target, ctx)
		}
	}
}
