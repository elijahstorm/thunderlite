import { audioEngine } from './audioEngine'
import { sfxForAction, type SfxAction, type SfxUnitRef } from './sfxMap'

/**
 * Fire the sound for a resolved action *at its animation beat* — the weapon
 * crack on the attacker's swing, the footstep as the walk begins — rather than
 * at the authoritative commit that lands after the whole visual sequence. The
 * commit still runs; it just suppresses these actions' sfx (see
 * `ApplyActionOptions.suppressSfxActions`) so the sound isn't played twice.
 *
 * Live gameplay only: the reconnect/replay path re-applies the event log through
 * `applyAction` with no animation, so it never reaches here and stays silent.
 */
export function playActionSfx(action: SfxAction, unit?: SfxUnitRef | null): void {
	const id = sfxForAction(action, unit)
	if (id) audioEngine.playSfx(id)
}
