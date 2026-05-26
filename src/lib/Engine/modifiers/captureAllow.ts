import { gameState, buildingGrants, type PlayerControls } from '$lib/Engine/gameState'
import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'

const grantsControl =
	(control: keyof PlayerControls): ModifierHandler =>
	(target: ModifierTarget, ctx: ModifierContext): void => {
		if (ctx.kind !== 'building') return
		if (!ctx.map) return

		const building = target as BuildingObject
		const newTeam = building.team
		const previousTeam = ctx.previousTeam

		if (typeof newTeam !== 'number') return

		gameState.update((state) => {
			let previousHasOther = false
			if (typeof previousTeam === 'number') {
				for (let tile = 0; tile < ctx.map!.layers.buildings.length; tile++) {
					const candidate = ctx.map!.layers.buildings[tile]
					if (!candidate) continue
					if (candidate === building) continue
					if (candidate.team !== previousTeam) continue
					if (buildingGrants(candidate.type).includes(control)) {
						previousHasOther = true
						break
					}
				}
			}

			return {
				...state,
				players: state.players.map((player) => {
					if (player.team === newTeam) {
						const controls = player.controls ?? { ground: false, air: false, sea: false }
						return { ...player, controls: { ...controls, [control]: true } }
					}
					if (
						typeof previousTeam === 'number' &&
						player.team === previousTeam &&
						!previousHasOther
					) {
						const controls = player.controls ?? { ground: false, air: false, sea: false }
						return { ...player, controls: { ...controls, [control]: false } }
					}
					return player
				}),
			}
		})
	}

export const captureAllowGround: ModifierHandler = grantsControl('ground')
export const captureAllowAir: ModifierHandler = grantsControl('air')
export const captureAllowSea: ModifierHandler = grantsControl('sea')
