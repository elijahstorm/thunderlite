import { unitData } from '$lib/GameData/unit'

/**
 * Pure action → sound-effect mapping.
 *
 * The original Battalion: Arena keyed a sound to each unit's *weapon profile*
 * (light / machine / big gun, or a "distance" report for indirect fire), to
 * each *movement type* (footstep / car / jet / boat …), plus a one-shot `build`
 * on spawn and `explosion` on death. We map by the unit's data fields — never by
 * unit name — so any new unit inherits sounds for free.
 *
 * This module is intentionally side-effect free: it returns a logical sfx id (a
 * key into `sfxManifest`) or `null`. The action-resolution layer decides when to
 * actually play it, and gates playback on a live-vs-replay flag so a reconnect
 * replay of the event log stays silent.
 */

/** Logical sfx ids understood by the audio manifest (`sfxManifest` keys). */
export type SfxId =
	| 'attack/light'
	| 'attack/machine'
	| 'attack/big'
	| 'attack/distance'
	| 'movement/foot'
	| 'movement/car'
	| 'movement/jet'
	| 'movement/helicopter'
	| 'movement/boat'
	| 'build'
	| 'explosion'

/** A resolved game action that may carry a sound. */
export type SfxAction = 'move' | 'attack' | 'build' | 'death'

/** Minimal unit reference: just enough to look up its data row. */
export interface SfxUnitRef {
	type: number
}

type MovementType = (typeof unitData)[number]['movementType']
type WeaponType = (typeof unitData)[number]['weaponType']

/** Movement locomotion → looping/clip movement sfx. `none` (turrets) is silent. */
const MOVEMENT_SFX: Record<MovementType, SfxId | null> = {
	none: null,
	foot: 'movement/foot',
	wheel: 'movement/car',
	tank: 'movement/car',
	'low air': 'movement/helicopter',
	'high air': 'movement/jet',
	boat: 'movement/boat',
	warship: 'movement/boat',
	submarine: 'movement/boat',
}

/** Direct-fire weapon class → gun sfx. Indirect units override this below. */
const WEAPON_SFX: Record<WeaponType, SfxId> = {
	light: 'attack/light',
	medium: 'attack/machine',
	heavy: 'attack/big',
}

/** Indirect (artillery / missile) units can't hit adjacent — they "report" at distance. */
const isIndirect = (range: readonly [number, number]): boolean => range[0] > 1

const attackSfx = (unit: (typeof unitData)[number]): SfxId =>
	isIndirect(unit.range) ? 'attack/distance' : WEAPON_SFX[unit.weaponType]

/**
 * Resolve the sound effect for a resolved action, or `null` when there is none.
 *
 *  - `move`   → the mover's movement-type sfx (immobile units are silent).
 *  - `attack` → the attacker's weapon sfx (indirect fire → `attack/distance`).
 *  - `build`  → the generic `build` chime (independent of the spawned unit).
 *  - `death`  → the generic `explosion` (independent of the destroyed unit).
 */
export function sfxForAction(action: SfxAction, unit?: SfxUnitRef | null): SfxId | null {
	switch (action) {
		case 'build':
			return 'build'
		case 'death':
			return 'explosion'
		case 'move': {
			const data = unit ? unitData[unit.type] : undefined
			return data ? MOVEMENT_SFX[data.movementType] : null
		}
		case 'attack': {
			const data = unit ? unitData[unit.type] : undefined
			return data ? attackSfx(data) : null
		}
	}
}
