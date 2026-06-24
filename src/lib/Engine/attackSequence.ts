import { unitData } from '$lib/GameData/unit'
import { calculateDamage, canCounterAttack } from './combat'
import {
	animateAttack,
	animateExplosion,
	animateHealthBar,
	beginAnimationBeat,
	endAnimationBeat,
} from './Animator/animator'
import type { SerializedAction } from './Interactor/serializedAction'

/**
 * Drives the visual choreography of one attack and commits its result. The beat:
 *
 *   1. the attacker swings (the target keeps its current pose — it does NOT turn yet);
 *   2. the target's health bar eases down to its new value (or it explodes if it died);
 *   3. if the target survives and can return fire, it wheels to face its attacker
 *      and counter-swings;
 *   4. only then does the attacker's bar ease down (or it explodes if the counter
 *      killed it).
 *
 * The authoritative state change is committed *after* the whole sequence, so the
 * units stay on the board (with their bars frozen via `displayHealth`) throughout —
 * a unit that dies isn't yanked off mid-counter. Because nothing mutates the real
 * `health` until the commit, the predicted outcomes below read the exact pre-combat
 * state `applyAttack` will, so they match what actually resolves. Shared by the
 * human interactor and the CPU so both play the identical beat.
 */
export const animateAttackSequence = async (
	map: MapObject,
	attackerTile: number,
	targetTile: number,
	commit: (action: SerializedAction) => void
): Promise<void> => {
	const action: SerializedAction = { kind: 'attack', from: attackerTile, to: targetTile }
	const attacker = map.layers.units[attackerTile]
	const target = map.layers.units[targetTile]
	if (!attacker || !target) {
		commit(action)
		return
	}

	const attackerMax = unitData[attacker.type]?.health ?? 0
	const targetMax = unitData[target.type]?.health ?? 0
	const attackerHealthBefore = attacker.health ?? attackerMax
	const targetHealthBefore = target.health ?? targetMax

	// Predict the outcome with the same functions `applyAttack` uses, on the same
	// pre-combat state, so the beat order (does the target die? does it counter?
	// does the counter kill the attacker?) is known before anything commits.
	const targetDamage = calculateDamage(attacker, target, {
		map,
		defenderTile: targetTile,
		attackerTile,
		role: 'attack',
	})
	const targetHealthAfter = Math.max(0, targetHealthBefore - targetDamage)
	const targetWillDie = targetHealthAfter <= 0

	const willCounter =
		!targetWillDie &&
		canCounterAttack(attacker, target, { map, attackerTile, defenderTile: targetTile })

	const counterDamage = willCounter
		? calculateDamage(target, attacker, {
				map,
				defenderTile: attackerTile,
				attackerTile: targetTile,
				role: 'counter',
			})
		: 0
	const attackerHealthAfter = Math.max(0, attackerHealthBefore - counterDamage)
	const attackerWillDie = willCounter && attackerHealthAfter <= 0

	// Freeze both bars at their pre-combat values; we release them step by step.
	attacker.displayHealth = attackerHealthBefore
	target.displayHealth = targetHealthBefore

	// Hold the board "busy" for the whole exchange — its quiet gaps (between the
	// strike, the bar ease, and the counter) leave `animations` momentarily empty,
	// and the moved unit is already marked acted, which would otherwise let the
	// auto-end-turn watcher fire mid-sequence and flip to the enemy's turn intro
	// while the counter is still playing.
	beginAnimationBeat()
	try {
		// 1. The attacker swings.
		await animateAttack(map, attacker, attackerTile, targetTile)

		// 2. The target: explode if it died, otherwise drain its bar to the new value.
		if (targetWillDie) {
			target.displayHealth = undefined
			// Hide the doomed unit's idle sprite under the blast; the commit below
			// removes it from the board for good.
			target.animating = true
			await animateExplosion(map, targetTile)
		} else {
			// `hold` — park the bar at its new value; the real `health` is only
			// committed in the `finally` below, so clearing now would flash the stale
			// pre-combat value and snap the bar back up.
			await animateHealthBar(target, targetHealthBefore, targetHealthAfter, true)
		}

		// 3 & 4. The survivor returns fire, then the attacker takes the hit.
		if (willCounter) {
			// Wheel the counter-attacker to face its foe and swing.
			await animateAttack(map, target, targetTile, attackerTile)
			if (attackerWillDie) {
				attacker.displayHealth = undefined
				attacker.animating = true
				await animateExplosion(map, attackerTile)
			} else {
				await animateHealthBar(attacker, attackerHealthBefore, attackerHealthAfter, true)
			}
		} else {
			attacker.displayHealth = undefined
		}
	} finally {
		// Commit the authoritative result last, with health still at pre-combat
		// values so the damage math is unaffected — this sets the real `health`,
		// removes any dead units, and runs death/win modifiers. In `finally` so a
		// failed animation (e.g. an unloaded attack sprite) can never strand the
		// action and freeze the turn; the game still advances.
		commit(action)

		// The bars now read the committed `health`; drop any leftover display
		// overrides so they settle on the authoritative value, and clear the
		// hide-sprite flags (survivors only — the dead are already off the board).
		if (map.layers.units[targetTile] === target) {
			target.displayHealth = undefined
			target.animating = false
		}
		if (map.layers.units[attackerTile] === attacker) {
			attacker.displayHealth = undefined
			attacker.animating = false
		}

		// Release the board. This re-arms the auto-end-turn watcher, which now sees
		// the committed acted state and can flip to the next turn cleanly.
		endAnimationBeat()
	}
}
