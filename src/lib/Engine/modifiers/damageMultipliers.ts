import { unitData } from '$lib/GameData/unit'
import type { ModifierKey } from './index'

export type AttackRole = 'attack' | 'counter'

export type DamageMultiplierCtx = {
	attacker: UnitObject
	defender: UnitObject
	role: AttackRole
	// Whether the attacker is concealed (cloaked / stealthed and not exposed by an
	// enemy radar ring) from where it strikes. Computed by the caller, which holds
	// the map geometry needed to test adjacency and radar; defaults to the persisted
	// `hidden` flag when geometry isn't available (e.g. unit-test fixtures).
	attackerConcealed?: boolean
}

type MultiplierHandler = (ctx: DamageMultiplierCtx) => number

const handlers: Partial<Record<ModifierKey, MultiplierHandler>> = {
	'Damage.Fast_Attack': ({ role }) => (role === 'attack' ? 1.2 : 1),
	'Damage.Slow_Attack': ({ role }) => (role === 'counter' ? 0.85 : 1),
	'Damage.Flak': ({ defender }) => {
		const def = unitData[defender.type]
		return def?.type === 'air' ? 2 : 1
	},
	// Ambush bonus: a stealth unit that strikes while still concealed doubles its
	// damage. Only on the opening blow — a counter-attack means the unit is already
	// engaged, not ambushing — and only while concealed, so a stealth unit an enemy
	// has flushed out (closed to point-blank, or lit up by a Jammer Truck's radar
	// from the tile it fires on) trades blows at normal strength.
	'Damage.Stealth_Strike': ({ attacker, role, attackerConcealed }) =>
		role === 'attack' && (attackerConcealed ?? attacker.hidden === true) ? 2 : 1,
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
