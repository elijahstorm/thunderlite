import { unitData } from '$lib/GameData/unit'
import { skyData } from '$lib/GameData/sky'
import { terrainData } from '$lib/GameData/terrain'
import { generateAttackList } from './Interactor/Pathing/attack'
import { canAttackTarget, hasModifier, isRanged } from './modifiers/canAttack'
import { computeDamageMultiplier, type AttackRole } from './modifiers/damageMultipliers'
import { tileHeightTier } from './modifiers/height'
import { adjacentTiles } from './modifiers/cloak'
import { isUnitStealthed, type VisibilityMap } from './visibility'

export type { AttackRole }

export type CombatContext = {
	map: Pick<MapObject, 'layers'>
	defenderTile: number
	/** Tile the attacker fires from. Enables the high-ground damage bonus; when
	 * omitted (callers that don't track it) the bonus is simply skipped. */
	attackerTile?: number
	role?: AttackRole
}

// High ground is an OFFENSE bonus only: firing downhill adds 8% damage per height
// tier of advantage, capped at +16% (~2 tiers). Firing uphill or on the level adds
// nothing — terrain `protection` already rewards the defender on raised ground, so
// an uphill penalty here would double-count and make Mountains/Hills oppressive.
const HIGH_GROUND_PER_TIER = 0.08
const HIGH_GROUND_CAP = 0.16
// A sniper (Damage.Highground, the Strider) weaponises elevation far harder than
// the baseline downhill nudge: +25% per tier, up to +75%. On a peak it's brutal;
// caught on the flat it has no bonus at all and is paper-thin.
const SNIPER_PER_TIER = 0.25
const SNIPER_CAP = 0.75

const highGroundBonus = (
	map: Pick<MapObject, 'layers'>,
	attackerTile: number,
	defenderTile: number,
	sniper: boolean
): number => {
	const advantage = tileHeightTier(map, attackerTile) - tileHeightTier(map, defenderTile)
	if (advantage <= 0) return 1
	const perTier = sniper ? SNIPER_PER_TIER : HIGH_GROUND_PER_TIER
	const cap = sniper ? SNIPER_CAP : HIGH_GROUND_CAP
	return 1 + Math.min(advantage * perTier, cap)
}

// Aegis projects a protective field over adjacent friendlies: any unit standing
// next to a teammate with Damage.Aegis takes 30% less damage. Computed here (not
// as an attacker-side Damage modifier) because the mitigator is a THIRD unit
// beside the defender, and combat already holds the map geometry to find it.
const AEGIS_MITIGATION = 0.7

const auraMitigation = (
	map: Pick<MapObject, 'layers'>,
	defenderTile: number,
	defenderTeam: number
): number => {
	const geo = map as Partial<VisibilityMap>
	if (typeof geo.cols !== 'number' || typeof geo.rows !== 'number') return 1
	for (const adj of adjacentTiles(geo as VisibilityMap, defenderTile)) {
		const ally = map.layers.units[adj]
		if (ally && ally.team === defenderTeam && hasModifier(ally, 'Damage.Aegis')) {
			return AEGIS_MITIGATION
		}
	}
	return 1
}

// The defensive cover a unit standing (or hovering) on `tile` enjoys, drawn from
// the layer its domain lives in: ground/sea units answer to the terrain layer,
// air units to the sky layer. Exported so the AI's positioning "cover" term and
// any preview UI price cover from the same single source combat does.
export const coverProtection = (
	map: Pick<MapObject, 'layers'>,
	tile: number,
	domain: 'ground' | 'air' | 'sea'
): number => {
	if (domain === 'air') {
		const sky = map.layers.sky[tile]
		return sky ? (skyData[sky.type]?.protection ?? 0) : 0
	}
	const ground = map.layers.ground[tile]
	return ground ? (terrainData[ground.type]?.protection ?? 0) : 0
}

const computeDamage = (attacker: UnitObject, defender: UnitObject, ctx: CombatContext): number => {
	const attackerStats = unitData[attacker.type]
	const defenderStats = unitData[defender.type]
	if (!attackerStats || !defenderStats) return 0

	const attackerMaxHealth = attackerStats.health
	const attackerCurrentHealth = attacker.health ?? attackerMaxHealth
	const hpRatio = attackerMaxHealth > 0 ? attackerCurrentHealth / attackerMaxHealth : 0

	const baseDamage = attackerStats.power * hpRatio
	const matchupBonus = attackerStats.weaponType === defenderStats.armorType ? 1.5 : 1.0

	// Cover comes from the layer the defender actually occupies. Ground terrain
	// can't shelter what flies above it, and weather can't shelter what crawls
	// beneath it: a surface unit reads the ground tile's protection, an air
	// defender reads the SKY tile's (cloud / storm cover) instead.
	// A siege attacker (Breaker) arcs its shells past cover: entrenched defenders
	// forfeit every point of terrain protection and eat the full hit. Splashed
	// neighbours lose their cover too, since each splash tile runs this same path.
	const protection = hasModifier(attacker, 'Damage.Siege')
		? 0
		: coverProtection(ctx.map, ctx.defenderTile, defenderStats.type)
	const terrainGuard = 1 - protection

	// Is the attacker concealed from the tile it fires on? Adjacency and radar both
	// need map geometry (cols/rows); when a caller supplies it we ask the canonical
	// predicate (so a Jammer Truck's radar can deny the stealth ambush), otherwise we
	// fall back to the persisted cloak flag inside `computeDamageMultiplier`.
	const geo = ctx.map as Partial<VisibilityMap>
	const attackerConcealed =
		ctx.attackerTile != null && typeof geo.cols === 'number' && typeof geo.rows === 'number'
			? isUnitStealthed(geo as VisibilityMap, ctx.attackerTile, attacker)
			: undefined

	const modMultiplier = computeDamageMultiplier({
		attacker,
		defender,
		role: ctx.role ?? 'attack',
		attackerConcealed,
	})

	// High ground is a TERRAIN advantage, so it needs both feet on terrain: an air
	// unit flies at its own altitude regardless of the tile it overflies, so it
	// neither gains a downhill bonus from a mountain beneath it nor concedes one
	// to a hilltop gun shooting up at it.
	const highGround =
		ctx.attackerTile != null && attackerStats.type !== 'air' && defenderStats.type !== 'air'
			? highGroundBonus(
					ctx.map,
					ctx.attackerTile,
					ctx.defenderTile,
					hasModifier(attacker, 'Damage.Highground')
				)
			: 1

	const aura = auraMitigation(ctx.map, ctx.defenderTile, defender.team)

	const final = Math.round(
		baseDamage * matchupBonus * terrainGuard * modMultiplier * highGround * aura
	)
	return final > 0 ? final : 0
}

export const calculateDamage = (
	attacker: UnitObject,
	defender: UnitObject,
	ctx: CombatContext
): number => computeDamage(attacker, defender, ctx)

export const previewDamage = (
	attacker: UnitObject,
	defender: UnitObject,
	ctx: CombatContext
): number => computeDamage(attacker, defender, ctx)

export type CounterAttackContext = {
	map: MapObject
	attackerTile: number
	defenderTile: number
}

export const canCounterAttack = (
	attacker: UnitObject,
	defender: UnitObject,
	ctx: CounterAttackContext
): boolean => {
	const defenderStats = unitData[defender.type]
	if (!defenderStats) return false

	const defenderHealth = defender.health
	if (typeof defenderHealth === 'number' && defenderHealth <= 0) return false

	if (defenderStats.power === 0) return false

	if (hasModifier(attacker, 'Attack.Stun')) return false

	if (!canAttackTarget(defender, attacker)) return false

	if (isRanged(defender) && !hasModifier(defender, 'Can_Attack.Counter_Range')) return false

	const attackList = generateAttackList(ctx.map, ctx.defenderTile, defender)
	if (!attackList.includes(ctx.attackerTile)) return false

	return true
}
