import { unitData } from '$lib/GameData/unit'
import { calculateDamage, canCounterAttack } from './combat'
import {
	animateAttack,
	animateExplosion,
	animateHealthBar,
	animateTileEffect,
	beginAnimationBeat,
	endAnimationBeat,
	repaintSignal,
} from './Animator/animator'
import { PAYLOAD_IMPACT_ANIMATION } from '$lib/GameData/animation'
import { SECONDARY_EFFECT_ANIMATION } from '$lib/GameData/animation'
import { canAttackTarget, hasModifier } from './modifiers/canAttack'
import { computeBehindTile } from './modifiers/lance'
import { splashTargetTiles, splashEffectFor, SPLASH_DAMAGE_SCALE } from './modifiers/splash'
import { burnableForestTiles, scorchTile } from './modifiers/burn'
import { beginMaterialize } from './materialize'
import { invalidateThreatOverlay } from './threatOverlay'
import { playActionSfx } from '$lib/Audio/playActionSfx'
import type { CommitOptions } from './applyAction'
import type { SerializedAction } from './Interactor/serializedAction'

// The impact sheet a ranged shooter's round leaves on the tile it strikes, or null
// for a melee unit. A melee swing plays right beside its victim, so the hit is
// obvious; a ranged swing plays tiles away, and in a fast game the only clue to
// *what* it hit was a bar quietly draining somewhere. Keyed off the unit's
// declared `payload` (see unit.ts) so each ammunition lands looking like itself.
const impactEffectFor = (shooter: UnitObject): number | null => {
	const payload = unitData[shooter.type]?.payload
	return payload ? PAYLOAD_IMPACT_ANIMATION[payload] : null
}

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
 * a unit that dies isn't yanked off mid-counter. Nothing mutates the real `health`
 * until the commit, so the predicted outcomes below read the same pre-combat state
 * `applyAttack` starts from — with one wrinkle the prediction reproduces by hand:
 * `applyAttack` lands the first hit before the counter, so the counter scales off
 * the target's *reduced* health (see `counterDamage`). Shared by the human
 * interactor and the CPU so both play the identical beat.
 */
export const animateAttackSequence = async (
	map: MapObject,
	attackerTile: number,
	targetTile: number,
	commit: (action: SerializedAction, opts?: CommitOptions) => void
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

	// `applyAttack` lands the first hit *before* resolving the counter, so the
	// counter's damage scales off the target's already-reduced HP (combat damage is
	// proportional to the firer's current health). Predict against that same
	// post-hit health — using the pre-combat value here overestimates the counter,
	// sliding the attacker's bar past its real value and snapping it back on commit.
	const counterDamage = willCounter
		? calculateDamage({ ...target, health: targetHealthAfter }, attacker, {
				map,
				defenderTile: attackerTile,
				attackerTile: targetTile,
				role: 'counter',
			})
		: 0
	const attackerHealthAfter = Math.max(0, attackerHealthBefore - counterDamage)
	const attackerWillDie = willCounter && attackerHealthAfter <= 0

	// A lancing attacker also strikes the unit directly behind the target on the
	// same beat (see `applyLancePassthrough`, which commits this hit). Predict it
	// here against the same pre-combat state — the passthrough's damage scales off
	// the attacker's current health, which the counter only reduces *after* this
	// hit lands — so its bar can drain in lockstep with the target's instead of
	// snapping to its new value after the whole sequence commits.
	const behindTile = hasModifier(attacker, 'Attack.Lance')
		? computeBehindTile(map, attackerTile, targetTile)
		: null
	// A behind unit the lance can't target (e.g. an air unit) is missed entirely by
	// the commit (`applyLancePassthrough`), so predict no hit for it either.
	const behindUnit = behindTile !== null ? map.layers.units[behindTile] : null
	const passthrough = behindUnit && canAttackTarget(attacker, behindUnit) ? behindUnit : null
	const passthroughMax = passthrough ? (unitData[passthrough.type]?.health ?? 0) : 0
	const passthroughHealthBefore = passthrough ? (passthrough.health ?? passthroughMax) : 0
	const passthroughDamage =
		passthrough && behindTile !== null
			? calculateDamage(attacker, passthrough, {
					map,
					defenderTile: behindTile,
					attackerTile,
					role: 'attack',
				})
			: 0
	const passthroughHealthAfter = Math.max(0, passthroughHealthBefore - passthroughDamage)
	const passthroughWillDie = !!passthrough && passthroughHealthAfter <= 0

	// A splash attacker (Scorcher / Breaker / Gunship) washes its neighbours for a
	// fraction of the blow on the same opening beat. Predict each against the same
	// pre-combat state `applyAttack` will — its splash also lands before the counter,
	// off the attacker's current health — so the splashed bars ease to exactly the
	// values the commit writes instead of snapping. Its flavor (fire vs shrapnel)
	// decides which effect we throw on each tile.
	const splashEffect = SECONDARY_EFFECT_ANIMATION[splashEffectFor(attacker)]
	const splashHits = splashTargetTiles(map, attackerTile, targetTile).map((tile) => {
		const unit = map.layers.units[tile]!
		const max = unitData[unit.type]?.health ?? 0
		const before = unit.health ?? max
		const damage = Math.round(
			calculateDamage(attacker, unit, {
				map,
				defenderTile: tile,
				attackerTile,
				role: 'attack',
			}) * SPLASH_DAMAGE_SCALE
		)
		const after = Math.max(0, before - damage)
		return { tile, unit, before, after, willDie: after <= 0 }
	})

	// A burning attacker (Scorcher) scorches the forest on and around its target.
	// That's a terrain change, animated as a burn-materialize per tile (below) rather
	// than a health hit. Captured now, while the tiles are still forest, so the swap
	// can be deferred to each tile's reveal instead of popping at commit.
	const scorchTiles = hasModifier(attacker, 'Attack.Burn')
		? burnableForestTiles(map, targetTile)
		: []

	// Freeze every involved bar at its pre-combat value; we release them step by step.
	attacker.displayHealth = attackerHealthBefore
	target.displayHealth = targetHealthBefore
	if (passthrough) passthrough.displayHealth = passthroughHealthBefore
	for (const h of splashHits) h.unit.displayHealth = h.before

	// Hold the board "busy" for the whole exchange — its quiet gaps (between the
	// strike, the bar ease, and the counter) leave `animations` momentarily empty,
	// and the moved unit is already marked acted, which would otherwise let the
	// auto-end-turn watcher fire mid-sequence and flip to the enemy's turn intro
	// while the counter is still playing.
	beginAnimationBeat()
	try {
		// 1. The attacker swings — crack the weapon sfx *now*, on the swing, rather
		//    than letting the post-sequence commit voice it seconds later. The commit
		//    suppresses 'attack' (see the call sites) so it isn't heard twice.
		playActionSfx('attack', attacker)
		await animateAttack(map, attacker, attackerTile, targetTile)

		// Scorched forest chars in under its own fire: a burn-materialize on each tile
		// runs concurrently with the strike, deferring the real forest→charred swap to
		// its reveal (so the tile changes under cover, never popping). The commit is
		// told to skip the swap (deferBurn) since these reveals own it now. Bumping
		// `repaintSignal` on reveal re-runs MapRender's autotile pass *now*, under the
		// cover — otherwise the fresh Charred Forest tiles keep their default state 0
		// (the isolated "single tile" frame) until the next repaint after the beat,
		// which reads as the tiles snapping to their connected borders a moment late.
		for (const t of scorchTiles) {
			beginMaterialize(t, 'burn', {
				onReveal: () => {
					scorchTile(map, t)
					// Burnt-out forest drives differently, so any enemy reach painted
					// through it has to be re-derived.
					invalidateThreatOverlay()
					repaintSignal.update((n) => n + 1)
				},
			})
		}

		// 2. The target — and, for a lancing attacker, the unit behind it — take the
		//    hit on the same beat: their bars drain in lockstep (and any explosions
		//    play together) rather than one waiting on the other to finish.
		const hits: Promise<void>[] = []

		// A ranged attacker's round lands on the target tile as the bar drains, so
		// the eye is drawn to where the hit arrived and not just the distant swing.
		// Skipped on a kill: the death blast already marks the tile unmistakably,
		// and a small burst under a big one just muddies it.
		const impact = impactEffectFor(attacker)
		if (impact !== null && !targetWillDie) {
			hits.push(animateTileEffect(map, targetTile, impact))
		}

		if (targetWillDie) {
			target.displayHealth = undefined
			// Hide the doomed unit's idle sprite under the blast; the commit below
			// removes it from the board for good.
			target.animating = true
			// Boom on the blast, not after it: the commit suppresses this tile's death
			// sfx (via `preVoicedDeathTiles`) so it isn't heard twice.
			playActionSfx('death', target)
			hits.push(animateExplosion(map, targetTile))
		} else {
			// `hold` — park the bar at its new value; the real `health` is only
			// committed in the `finally` below, so clearing now would flash the stale
			// pre-combat value and snap the bar back up.
			hits.push(animateHealthBar(target, targetHealthBefore, targetHealthAfter, true))
		}

		if (passthrough && behindTile !== null) {
			// The shaft drives on through the tile behind — mark it with a pierce shock
			// so the passthrough reads as the lance and not a second, unrelated hit.
			hits.push(animateTileEffect(map, behindTile, SECONDARY_EFFECT_ANIMATION.pierce))
			if (passthroughWillDie) {
				passthrough.displayHealth = undefined
				passthrough.animating = true
				playActionSfx('death', passthrough)
				hits.push(animateExplosion(map, behindTile))
			} else {
				hits.push(
					animateHealthBar(passthrough, passthroughHealthBefore, passthroughHealthAfter, true)
				)
			}
		}

		// Splash neighbours take their share on the same beat: the attack's flavor
		// effect blooms on each tile while its bar drains (or it explodes if the wash
		// killed it). Ride the same `hits` array so they play with the primary hit.
		for (const h of splashHits) {
			hits.push(animateTileEffect(map, h.tile, splashEffect))
			if (h.willDie) {
				h.unit.displayHealth = undefined
				h.unit.animating = true
				playActionSfx('death', h.unit)
				hits.push(animateExplosion(map, h.tile))
			} else {
				hits.push(animateHealthBar(h.unit, h.before, h.after, true))
			}
		}

		await Promise.all(hits)

		// 3 & 4. The survivor returns fire, then the attacker takes the hit.
		if (willCounter) {
			// Wheel the counter-attacker to face its foe and swing — its weapon
			// sounds on this beat, matching the opening swing's timing.
			playActionSfx('attack', target)
			await animateAttack(map, target, targetTile, attackerTile)
			if (attackerWillDie) {
				attacker.displayHealth = undefined
				attacker.animating = true
				playActionSfx('death', attacker)
				await animateExplosion(map, attackerTile)
			} else {
				// A ranged defender returning fire (Counter_Range) lobs its own round
				// back, so its payload lands on the attacker's tile the same way.
				const counterImpact = impactEffectFor(target)
				await Promise.all([
					...(counterImpact !== null ? [animateTileEffect(map, attackerTile, counterImpact)] : []),
					animateHealthBar(attacker, attackerHealthBefore, attackerHealthAfter, true),
				])
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
		//
		// The weapon crack and each blast we animated above are already voiced, so
		// tell the commit to stay silent for them: 'attack' (both swings) and the
		// specific tiles whose explosion we played — including the splash kills we
		// now predict and boom on the blast beat. Any death the sequence never
		// predicted still isn't listed, so applyAction booms those here.
		const preVoicedDeathTiles: number[] = []
		if (targetWillDie) preVoicedDeathTiles.push(targetTile)
		if (passthroughWillDie && behindTile !== null) preVoicedDeathTiles.push(behindTile)
		if (attackerWillDie) preVoicedDeathTiles.push(attackerTile)
		for (const h of splashHits) if (h.willDie) preVoicedDeathTiles.push(h.tile)
		commit(action, {
			suppressSfxActions: ['attack'],
			preVoicedDeathTiles,
			// The burn-materialize reveals own the forest→charred swap now, so the
			// commit must not also do it (which would pop the tiles instantly).
			deferBurn: scorchTiles.length > 0,
		})

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
		if (passthrough && behindTile !== null && map.layers.units[behindTile] === passthrough) {
			passthrough.displayHealth = undefined
			passthrough.animating = false
		}
		for (const h of splashHits) {
			if (map.layers.units[h.tile] === h.unit) {
				h.unit.displayHealth = undefined
				h.unit.animating = false
			}
		}

		// Release the board. This re-arms the auto-end-turn watcher, which now sees
		// the committed acted state and can flip to the next turn cleanly.
		endAnimationBeat()
	}
}
