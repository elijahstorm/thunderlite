import { hasModifier } from './modifiers/canAttack'

/**
 * A Warmachine is built holding its own funds, kept entirely separate from the
 * player's money pool. It spends this wallet on the units it builds and refills
 * it by mining ore deposits (+500 each). When the Warmachine dies the player
 * loses (Death.Insta_Lose), so its wallet dies with it — it is never returned to
 * the player pool.
 */
export const WARMACHINE_WALLET = 2000

/**
 * A "wallet unit" owns funds independent of its player. Keyed off the Builder
 * modifier (currently only the Warmachine) so any future self-building unit gets
 * the same private-economy behaviour for free.
 */
export const isWalletUnit = (unit: UnitObject): boolean => hasModifier(unit, 'Self_Action.Builder')

/**
 * Read a unit's wallet balance. A wallet unit that has never mined or built yet
 * carries no stored balance, so it defaults to the full starting wallet — mirrors
 * how `unit.health` defaults to the type's max. This means both map-placed and
 * freshly-built Warmachines start at {@link WARMACHINE_WALLET} with no init pass.
 */
export const walletOf = (unit: UnitObject): number =>
	typeof unit.wallet === 'number' ? unit.wallet : isWalletUnit(unit) ? WARMACHINE_WALLET : 0
