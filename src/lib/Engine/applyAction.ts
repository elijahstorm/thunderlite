import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { calculateDamage, canCounterAttack } from './combat'
import { gameState, markTileActed } from './gameState'
import { runModifiers } from './modifiers'
import { hasAdjacentEnemy, revealCloakedAdjacentTo } from './modifiers/cloak'
import { applyLancePassthrough } from './modifiers/lance'
import { splashTargetTiles, SPLASH_DAMAGE_SCALE } from './modifiers/splash'
import { burnForestAround } from './modifiers/burn'
import { applyVultureKill } from './modifiers/vulture'
import { mine } from './modifiers/miner'
import { hasModifier } from './modifiers/canAttack'
import { resetCaptureProgress } from './modifiers/capture'
import { repair } from './modifiers/repair'
import { landUnload, transportLoad } from './modifiers/transport'
import { buildAdjacent } from './modifiers/builder'
import { spawnBuiltUnit } from './build'
import { endTurn } from './turnLoop'
import { applyWinConditions } from './winConditions'
import { audioEngine } from '$lib/Audio/audioEngine'
import { sfxForAction, type SfxAction, type SfxUnitRef } from '$lib/Audio/sfxMap'
import { recordMatchStat, type StatEvent } from './matchStats'
import { concealsSelfAt, isStealthUnit } from './visibility'
import {
	recordStealthBuild,
	recordStealthDeath,
	recordPerceivedStealth,
	noteStealthRevealed,
} from './cpuAi/stealthMemory'
import { recordFogKill } from './cpuAi/fogMemory'
import type { SerializedAction } from './Interactor/serializedAction'
import { recordAction } from './devLog'

/**
 * Options threaded through the apply path. `applyAction` stays deterministic and
 * silent by default — sound is a side effect of *live* player actions only. The
 * reconnect/replay path (H3) re-applies the whole event log; if those fired
 * SFX a reconnecting player would hear 40 explosions at once, so SFX are gated
 * on `live` and default to off.
 */
export interface ApplyActionOptions {
	/** Fire SFX for this action. Off for replay / headless. Default `false`. */
	live?: boolean
	/** Injectable sfx sink (testing). Defaults to the shared audio engine. */
	playSfx?: (id: string) => void
	/** Injectable stat sink (testing). Defaults to the shared match-stats tracker. */
	recordStat?: (event: StatEvent) => void
	/**
	 * SFX actions already voiced at their animation beat (weapon crack on the
	 * swing, footstep at walk start), so this commit stays silent for them and
	 * the sound isn't played twice. See `playActionSfx`.
	 */
	suppressSfxActions?: SfxAction[]
	/**
	 * Tiles whose death (explosion) sfx was already voiced on its blast beat, so
	 * this commit stays silent for those units. Deaths *not* listed here (e.g. a
	 * splash / burn kill the animator never predicted) still sound. See
	 * `animateAttackSequence`.
	 */
	preVoicedDeathTiles?: number[]
	/**
	 * Skip the Attack.Burn terrain swap. The animated commit path sets this so each
	 * scorched tile's forest→charred change can be deferred to its burn-materialize
	 * reveal (so it swaps under cover instead of popping); the instant path
	 * (headless / replay / CPU-direct) leaves it off and scorches at commit. See
	 * `animateAttackSequence`.
	 */
	deferBurn?: boolean
}

/**
 * The subset of options a live animated commit forwards from the sequencer: sfx
 * already voiced on the animation beat, tiles whose death was pre-voiced, and
 * whether the burn terrain swap is deferred to its reveal. Shared so the human,
 * CPU and remote commit callbacks stay in lockstep.
 */
export type CommitOptions = Pick<
	ApplyActionOptions,
	'suppressSfxActions' | 'preVoicedDeathTiles' | 'deferBurn'
>

/**
 * Emits the resolved sfx for an action, or does nothing for replay/headless.
 * The optional `tile` lets a death be suppressed per-tile when its explosion was
 * already voiced on the blast beat (see `preVoicedDeathTiles`).
 */
type SfxEmit = (action: SfxAction, unit?: SfxUnitRef | null, tile?: number) => void

const NO_SFX: SfxEmit = () => {}

const makeSfxEmit = (opts: ApplyActionOptions): SfxEmit => {
	if (!opts.live) return NO_SFX
	const suppressed = new Set(opts.suppressSfxActions ?? [])
	const deathVoiced = new Set(opts.preVoicedDeathTiles ?? [])
	const sink = opts.playSfx ?? ((id: string) => audioEngine.playSfx(id))
	return (action, unit, tile) => {
		if (suppressed.has(action)) return
		if (action === 'death' && tile !== undefined && deathVoiced.has(tile)) return
		const id = sfxForAction(action, unit)
		if (id) sink(id)
	}
}

/**
 * Emits a per-player stat event, or nothing for replay/headless (J2). Gated on
 * `live` exactly like SFX so a reconnect's replayed event log never re-counts
 * builds, kills, damage, or captures.
 */
type StatEmit = (event: StatEvent) => void

const NO_STAT: StatEmit = () => {}

const makeStatEmit = (opts: ApplyActionOptions): StatEmit => {
	if (!opts.live) return NO_STAT
	return opts.recordStat ?? recordMatchStat
}

const reduceHealth = (
	map: MapObject | MapProcesser,
	attacker: UnitObject,
	target: UnitObject,
	tile: number,
	attackerTile: number,
	role: 'attack' | 'counter',
	fx: SfxEmit,
	stat: StatEmit,
	// Splash and other secondary hits land at a fraction of the full blow.
	damageScale = 1
): boolean => {
	const damage = Math.round(
		calculateDamage(attacker, target, {
			map: map as MapObject,
			defenderTile: tile,
			attackerTile,
			role,
		}) * damageScale
	)
	const max = unitData[target.type]?.health ?? 0
	const current = target.health ?? max
	const next = Math.max(0, current - damage)
	// Credit the dealer with HP actually removed (capped, so overkill doesn't inflate).
	stat({ kind: 'damage', team: attacker.team, amount: current - next })
	target.health = next
	if (next === 0) {
		map.layers.units[tile] = null
		// A capturing unit dying mid-capture abandons the building, same as walking off.
		resetCaptureProgress(map.layers.buildings[tile], target.team)
		// A witnessed stealth-unit death trims the CPU's remembered tally for that team.
		if (isStealthUnit(target)) recordStealthDeath(map, tile, target.team)
		fx('death', target, tile)
		stat({ kind: 'loss', team: target.team })
		runModifiers(target, 'Death', {
			kind: 'unit',
			tile,
			state: get(gameState),
			map,
		})
		return true
	}
	return false
}

// Movement is not a tracked stat; it only emits SFX.
const applyMove = (map: MapObject | MapProcesser, from: number, to: number, fx: SfxEmit): void => {
	const unit = map.layers.units[from]
	if (!unit) return
	if (from === to) return
	// Abandoning a capture: stepping off the tile heals the building back to full.
	resetCaptureProgress(map.layers.buildings[from], unit.team)
	map.layers.units[from] = null
	map.layers.units[to] = unit
	fx('move', unit)
	runModifiers(unit, 'Move', {
		kind: 'unit',
		tile: to,
		state: get(gameState),
		map,
	})
	revealCloakedAdjacentTo(map as MapObject, to, unit.team)
	// A move can flush a cloaked unit into the open — the mover ends point-blank to it,
	// or a collision halts the mover right beside it. Record every stealth unit now
	// perceivable to any team, so the watcher pins its tile while it's exposed rather
	// than only sampling at its own turn start (by when it has slipped back into fog).
	recordPerceivedStealth(map)
	// A stealth unit re-settles its own cloak the instant it finishes moving, rather than
	// staying flushed (`hidden === false` from a prior point-blank reveal) until its
	// End_Turn.Cloak. Walk a stealth tank out from under an enemy and it vanishes the
	// moment it reaches safety — same reveal-when-adjacent rule the End_Turn handler uses.
	// Ordered after recordPerceivedStealth so the watcher still pins where it went.
	if (isStealthUnit(unit)) unit.hidden = !hasAdjacentEnemy(map, to, unit.team)
	// A unit concealed some other way (air cover from weather) surfaces once it moves
	// somewhere nothing conceals it — otherwise its stale `hidden` flag would trail it
	// into the open, leaving it invisible until an enemy closes to point-blank. We only
	// clear here: gaining fresh cover stays deferred to end of turn.
	else if (unit.hidden && !concealsSelfAt(map, to, unit)) unit.hidden = false
	markTileActed(to)
}

const applyAttack = (
	map: MapObject | MapProcesser,
	from: number,
	to: number,
	fx: SfxEmit,
	stat: StatEmit,
	// When true, leave the burn terrain swap to the caller (the animated sequencer
	// scorches each tile under its materialize reveal); otherwise scorch now.
	deferBurn = false
): void => {
	const attacker = map.layers.units[from]
	const target = map.layers.units[to]
	if (!attacker || !target) return

	fx('attack', attacker)
	// Firing breaks cover: a cloaked attacker is seen by everyone, who now know it
	// exists and the tile it struck from — even if it re-cloaks the instant the smoke
	// clears (e.g. it killed the only unit that was keeping it flushed).
	if (isStealthUnit(attacker)) noteStealthRevealed(map, from, attacker)
	// A capture-capable unit that attacks forfeits next turn's auto-capture tick;
	// the flag is consumed by the Start_Turn capture handler. Tagged only on
	// capturers so the field never spreads to units that can't capture anyway.
	if (hasModifier(attacker, 'Start_Turn.Capture')) attacker.attacked = true
	const targetDied = reduceHealth(map, attacker, target, to, from, 'attack', fx, stat)
	applyLancePassthrough(map as MapObject, from, to)

	// Scorcher's flame washes over everything around the target (Attack.Splash) and
	// scorches any forest it touches (Attack.Burn). Both run on the opening blow only
	// (like Lance), never on a counter, and splash lands at half strength. The wash
	// only catches unit types the attacker could aim at directly (canAttackTarget) —
	// a ground-bound flame passes harmlessly under an air unit beside the target.
	for (const adj of splashTargetTiles(map, from, to)) {
		const splashed = map.layers.units[adj]
		if (splashed) {
			reduceHealth(map, attacker, splashed, adj, from, 'attack', fx, stat, SPLASH_DAMAGE_SCALE)
		}
	}
	if (hasModifier(attacker, 'Attack.Burn') && !deferBurn) burnForestAround(map, to)

	let attackerDied = false
	if (
		!targetDied &&
		canCounterAttack(attacker, target, {
			map: map as MapObject,
			attackerTile: from,
			defenderTile: to,
		})
	) {
		// The defender returns fire — sound its own weapon before resolving the hit.
		fx('attack', target)
		attackerDied = reduceHealth(map, target, attacker, from, to, 'counter', fx, stat)
	}

	// Firing reveals a cloaked attacker — but only if it left a witness. A surviving
	// target (and its nearby allies) saw exactly where the shot came from, so the
	// attacker drops its cloak and stays exposed rather than blinking out the moment
	// the attack resolves. A clean kill leaves nobody to tell, so the killer keeps its
	// cloak (its `hidden` flag is untouched here and re-settles at its End_Turn.Cloak).
	if (isStealthUnit(attacker) && !targetDied && !attackerDied) attacker.hidden = false

	markTileActed(from)
	// A unit destroyed by a foe it couldn't see plants a fog hunch at the killer's
	// tile for the loser, so the AI learns roughly where the threat struck from
	// (replaces the old, move-confused own-unit tile diff).
	if (targetDied) recordFogKill(map, from, target.team)
	if (attackerDied) recordFogKill(map, to, attacker.team)
	if (targetDied && !attackerDied) applyVultureKill(attacker, from)
	applyWinConditions(map as MapObject)
}

export const applyAction = (
	map: MapObject | MapProcesser,
	action: SerializedAction,
	opts: ApplyActionOptions = {}
): void => {
	// Dev-only: log the action + the board it acted on (no-op in prod / tests).
	recordAction(map, action)
	const fx = makeSfxEmit(opts)
	const stat = makeStatEmit(opts)
	switch (action.kind) {
		case 'move': {
			applyMove(map, action.from, action.to, fx)
			return
		}
		case 'attack': {
			applyAttack(map, action.from, action.to, fx, stat, opts.deferBurn ?? false)
			return
		}
		case 'capture': {
			const unit = map.layers.units[action.tile]
			if (!unit) return
			stat({ kind: 'capture', team: unit.team })
			runModifiers(unit, 'Start_Turn', {
				kind: 'unit',
				tile: action.tile,
				state: get(gameState),
				map,
			})
			markTileActed(action.tile)
			applyWinConditions(map as MapObject)
			return
		}
		case 'mine': {
			const unit = map.layers.units[action.tile]
			if (!unit) return
			mine(map, action.tile, unit.team)
			applyWinConditions(map as MapObject)
			return
		}
		case 'repair': {
			const unit = map.layers.units[action.tile]
			if (!unit) return
			repair(map, action.tile, unit.team)
			applyWinConditions(map as MapObject)
			return
		}
		case 'build': {
			const building = map.layers.buildings[action.building]
			if (!building) return
			const built = spawnBuiltUnit(map, action.building, action.unitType, building.team)
			// A stealth unit rolling off the line is logged by every team that can see
			// the factory, feeding their fuzzy memory of enemy cloak strength.
			if (built.ok && typeof built.tile === 'number') {
				const spawned = map.layers.units[built.tile]
				if (spawned && isStealthUnit(spawned)) recordStealthBuild(map, built.tile, building.team)
			}
			fx('build')
			stat({ kind: 'build', team: building.team })
			applyWinConditions(map as MapObject)
			return
		}
		case 'build-adjacent': {
			const builder = map.layers.units[action.builder]
			if (!builder) return
			const built = buildAdjacent(
				map,
				action.builder,
				action.unitType,
				builder.team,
				action.destination
			)
			if (built.ok && typeof built.tile === 'number') {
				const spawned = map.layers.units[built.tile]
				if (spawned && isStealthUnit(spawned)) recordStealthBuild(map, built.tile, builder.team)
				fx('build')
				stat({ kind: 'build', team: builder.team })
			}
			applyWinConditions(map as MapObject)
			return
		}
		case 'transport-load': {
			const result = transportLoad(map, action.passenger, action.transport)
			if (result.ok) {
				markTileActed(action.transport)
				applyWinConditions(map as MapObject)
			}
			return
		}
		case 'transport-unload': {
			// The carried unit disembarks onto the transport's own tile, so it inherits
			// that tile's acted state: already spent if the transport moved here this
			// turn (post-move land), still free to move if it landed without moving.
			// Nothing to mark — landUnload removes the transport and drops the unit in
			// the same cell, keeping whatever acted flag the cell already had.
			const result = landUnload(map, action.transport, action.tile)
			if (result.ok) {
				applyWinConditions(map as MapObject)
			}
			return
		}
		case 'wait': {
			markTileActed(action.tile)
			applyWinConditions(map as MapObject)
			return
		}
		case 'end-turn': {
			// Credit the turn to whoever is ending it, before `endTurn` advances.
			stat({ kind: 'turn', team: get(gameState).currentTeam })
			// Capture now resolves inside `endTurn` (the next team's Start_Turn phase)
			// rather than via a menu action, so the capture stat is credited here by
			// diffing building ownership across the turn flip. Goes through the same
			// live-gated `stat` sink, so replay/reconnect stays silent.
			const ownersBefore = map.layers.buildings.map((b) => b?.team ?? null)
			endTurn({ map })
			// Only buildings that flipped *to the team that just started its turn* are
			// auto-captures. This excludes ownership changes from a player defeat
			// (those neutralize to NEUTRAL_TEAM, not the active team).
			const activeTeam = get(gameState).currentTeam
			map.layers.buildings.forEach((b, tile) => {
				if (b && b.team === activeTeam && ownersBefore[tile] !== activeTeam) {
					stat({ kind: 'capture', team: activeTeam })
				}
			})
			return
		}
		case 'surrender': {
			// The surrendering team is eliminated; win conditions then resolve the
			// match (the lone survivor wins). Relayed like any other action, so an
			// online opponent sees the forfeit and the match ends on both clients.
			gameState.update((s) => ({
				...s,
				players: s.players.map((p) => (p.team === action.team ? { ...p, hasLost: true } : p)),
			}))
			applyWinConditions(map as MapObject)
			// A forfeit by the side whose turn it IS has to hand the turn on, or the
			// board sits on a team that no longer plays and nothing can move. With two
			// sides the match is simply over (win conditions, above), which is why
			// this never mattered before; from three sides up the game continues
			// without the quitter and somebody has to be given the turn.
			const after = get(gameState)
			if (after.phase === 'playing' && after.currentTeam === action.team) {
				endTurn({ map })
			}
			return
		}
	}
}
