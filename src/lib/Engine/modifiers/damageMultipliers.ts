import { unitData } from '$lib/GameData/unit'
import type { ModifierKey } from './index'

export type AttackRole = 'attack' | 'counter'

export type DamageMultiplierCtx = {
	attacker: UnitObject
	defender: UnitObject
	role: AttackRole
}

type MultiplierHandler = (ctx: DamageMultiplierCtx) => number

const handlers: Partial<Record<ModifierKey, MultiplierHandler>> = {
	'Damage.Fast_Attack': ({ role }) => (role === 'attack' ? 1.2 : 1),
	'Damage.Slow_Attack': ({ role }) => (role === 'counter' ? 0.85 : 1),
	'Damage.Flak': ({ defender }) => {
		const def = unitData[defender.type]
		return def?.armorType === 'light' ? 2 : 1
	},
}

export const computeDamageMultiplier = (ctx: DamageMultiplierCtx): number => {
	const attackerMods = unitData[ctx.attacker.type]?.modifiers ?? []
	let mult = 1
	for (const key of attackerMods) {
		const h = handlers[key]
		if (h) mult *= h(ctx)
	}
	return mult
}
