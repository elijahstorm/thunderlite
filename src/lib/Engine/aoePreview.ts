import { hasModifier, canAttackTarget } from './modifiers/canAttack'
import { splashTilesFor } from './modifiers/splash'
import { computeBehindTile } from './modifiers/lance'
import { generateAttackList } from './Interactor/Pathing/attack'

/**
 * Every tile that would take a *secondary* hit if `attacker`, firing from
 * `firingTile`, struck `targetTile`: a splash attacker's wash over the target's
 * neighbours and a lance's passthrough tile behind it. The primary target tile is
 * NOT included — the attack overlay already lands there. Takes the attacker
 * explicitly because during a hover preview it may not sit on `firingTile` yet
 * (a direct unit is still choosing where to move); the underlying helpers skip the
 * attacker by identity so a mover isn't shown as its own victim.
 */
export const aoePreviewTiles = (
	map: MapObject,
	attacker: UnitObject,
	firingTile: number,
	targetTile: number
): number[] => {
	const tiles: number[] = []

	if (hasModifier(attacker, 'Attack.Splash')) {
		tiles.push(...splashTilesFor(map, attacker, firingTile, targetTile))
	}

	if (hasModifier(attacker, 'Attack.Lance')) {
		const behind = computeBehindTile(map, firingTile, targetTile)
		if (behind !== null) {
			const victim = map.layers.units[behind]
			// The shaft overflies a type it can't target (an air unit behind a ground
			// foe), so preview only a tile it would actually hit — mirrors the commit.
			if (victim && victim !== attacker && canAttackTarget(attacker, victim)) {
				tiles.push(behind)
			}
		}
	}

	return tiles
}

/**
 * The splash/lance footprint to paint while the player hovers a potential attack.
 * Resolves the tile the attacker would fire *from* (a melee unit's hovered approach
 * is the last tile of its route; a ranged unit fires from where it stands), confirms
 * the hovered tile is genuinely a target it can reach from there, then returns the
 * secondary-hit tiles. Empty when nothing applies (no splash/lance attacker, the
 * hovered tile isn't a valid target, etc.) so the caller can clear the overlay.
 */
export const splashPreviewForHover = (
	map: MapObject,
	source: number | null,
	pathHistory: number[] | undefined,
	hoveredTile: number
): Set<number> => {
	const empty = new Set<number>()
	if (source === null) return empty
	const attacker = map.layers.units[source]
	if (!attacker) return empty
	if (!hasModifier(attacker, 'Attack.Splash') && !hasModifier(attacker, 'Attack.Lance'))
		return empty
	if (!map.layers.units[hoveredTile]) return empty

	// A melee unit's route ends on the tile it strikes from; a ranged unit never
	// moves, so it fires from its own tile.
	const firingTile =
		pathHistory && pathHistory.length ? pathHistory[pathHistory.length - 1] : source
	if (!generateAttackList(map, firingTile, attacker).includes(hoveredTile)) return empty

	return new Set(aoePreviewTiles(map, attacker, firingTile, hoveredTile))
}
