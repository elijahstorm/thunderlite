<script lang="ts">
	import { onMount } from 'svelte'
	import { terrainRenderer } from '$lib/GameData/terrain'
	import { skyRenderer } from '$lib/GameData/sky'
	import { attacksRenderer, unitData, unitRenderer } from '$lib/GameData/unit'
	import { buildingRenderer } from '$lib/GameData/building'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import type { imageColorizer } from '$lib/Sprites/imageColorizer'
	import type { createImageLoader } from '$lib/Sprites/images'
	import { animationData, animationRenderer } from '$lib/GameData/animation'
	import { gameState } from './gameState'
	import { onMatchEnd } from './matchEnd'
	import { createCampaignRunner } from '$lib/Campaign/campaignRunner'
	import { createCampaignInterface } from '$lib/Campaign/campaignInterface'
	import { scriptReferencedTypeIndices } from '$lib/Campaign/cutsceneScript'
	import { beginScriptBlock, endScriptBlock, resetScriptGate } from '$lib/Campaign/scriptGate'
	import Dialogue from '$lib/Campaign/Dialogue.svelte'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'

	export let map: MapObject
	export let colorizer: ReturnType<typeof imageColorizer>
	export let makeImage: ReturnType<typeof createImageLoader>
	export let select = (x: number, y: number) => {}
	/** When set, this level is a scripted campaign level (K1 parse output). */
	export let campaign: CutsceneScript | undefined = undefined

	let validTile = (x: number, y: number) => x < map.cols && y < map.rows

	const interfacer: InterfaceInteraction = (() => {
		return {
			selected: { x: -1, y: -1 },
			hover: { x: -1, y: -1 },
			offset: { x: 0, y: 0, zoom: 1 },
			key: { key: '', shift: false },
		}
	})()

	let renderData: ObjectRenderer = {
		ground: (type: number) => $rendererStore.ground[type],
		sky: (type?: number) =>
			typeof type !== 'undefined' ? ($rendererStore.sky[type] ?? null) : null,
		unit: (type?: number) =>
			typeof type !== 'undefined' ? ($rendererStore.units[type] ?? null) : null,
		building: (type?: number) =>
			typeof type !== 'undefined' ? ($rendererStore.buildings[type] ?? null) : null,
		animation: (type: number) => $rendererStore.animation[type] ?? null,
	}

	onMount(() => {
		const [ground, sky, units, attacks, buildings, animation] = [
			terrainRenderer,
			skyRenderer,
			unitRenderer,
			attacksRenderer,
			buildingRenderer,
			animationRenderer,
		].map((renderer) => renderer(makeImage, colorizer))

		// A campaign script can swap in terrain / buildings / weather types that no
		// starting tile uses (e.g. a scripted Bridge). The initial-map filter would
		// cull those, leaving them sprite-less and invisible, so union in every type
		// the script references. (Units/attacks/animation already preload all types.)
		const scriptTypes = campaign
			? scriptReferencedTypeIndices(campaign)
			: { ground: [], buildings: [], sky: [] }
		const withScript = (included: number[], extra: number[]) => [...new Set([...included, ...extra])]

		rendererStore.update((store) => ({
			ground: {
				...store.ground,
				...ground(withScript(map.filters.ground(map.layers.ground), scriptTypes.ground)),
			},
			sky: {
				...store.sky,
				...sky(withScript(map.filters.sky(map.layers.sky), scriptTypes.sky)),
			},
			// Preload every unit type's idle/move sprite, not just the ones standing
			// on the initial map. Factories can build types that weren't placed at
			// start; without warming the cache here, moving a freshly built type
			// crashes the route overlay (its renderer is undefined) and freezes the
			// board, since the animation effect throws mid-render.
			units: { ...store.units, ...units(unitData.map((_, index) => index)) },
			// Same reasoning for attack sprites, which additionally race the player's
			// first attack even for initial-map types; warming the cache avoids the
			// brief "unit disappears" gap when the overlay fires before its image has
			// decoded.
			attacks: { ...store.attacks, ...attacks(unitData.map((_, index) => index)) },
			buildings: {
				...store.buildings,
				...buildings(withScript(map.filters.buildings(map.layers.buildings), scriptTypes.buildings)),
			},
			animation: { ...store.animation, ...animation(animationData.map((_, index) => index)) },
		}))
	})

	// Campaign layer (K2): when a scripted level is active, drive its script
	// against the live engine. `start` runs on mount; each new side-turn fires
	// its `turns[round][team]` block once; the J1 match-end hook plays
	// `win`/`lose`. Between scripted beats the player keeps normal control of
	// the match. Round and team are zero-based; the engine's 1-based
	// `turnNumber` is translated here so script authors can write `<turn 0,1>`
	// for "CPU's first turn".
	onMount(() => {
		if (!campaign) return

		const runner = createCampaignRunner(campaign, createCampaignInterface({ map }))

		// Freeze the match (player input + CPU + auto-end-turn, all gated in
		// GameStateManager) while a block runs, but only when the block actually has
		// events — an empty side-turn must not pointlessly stall the CPU behind the
		// gate. The `start` block always runs on mount before either side acts.
		const runGated = async (events: unknown[] | undefined, run: () => Promise<void>) => {
			if (!events || events.length === 0) {
				await run()
				return
			}
			beginScriptBlock()
			try {
				await run()
			} finally {
				endScriptBlock()
			}
		}

		void runGated(campaign.start, () => runner.start())

		let lastKey = ''
		const offTurn = gameState.subscribe((state) => {
			const round = state.turnNumber - 1
			const team = state.currentTeam
			const key = `${round}:${team}`
			if (key !== lastKey) {
				lastKey = key
				void (async () => {
					await runGated(campaign.turns[round]?.[team], () => runner.enterTurn(round, team))
					// After the side-turn block, fire any `<when>` triggers whose condition
					// now holds (e.g. the wave is cleared, or both commandos are gone). Gated
					// so the dialogue/spawns it plays freeze the match like any other block.
					if (runner.hasPendingConditions(map)) {
						beginScriptBlock()
						try {
							await runner.checkConditions(map)
						} finally {
							endScriptBlock()
						}
					}
				})()
			}
		})
		// `finish` plays win/lose; the match is already over so the gate is belt-and-
		// suspenders, but it keeps the CPU from queuing one last move under the block.
		const offMatchEnd = onMatchEnd((result) => {
			const won = result.players.find((p) => p.isLocal)?.outcome === 'win'
			void runGated(won ? campaign.win : campaign.lose, () => runner.finish(result))
		})

		return () => {
			offTurn()
			offMatchEnd()
			// A level torn down mid-block (navigating away during dialogue) must not
			// leave the shared gate raised for the next mount.
			resetScriptGate()
		}
	})
</script>

<slot {interfacer} {select} {validTile} {renderData}></slot>

{#if campaign}
	<Dialogue />
{/if}
