<script lang="ts">
	import { onMount } from 'svelte'
	import { terrainData, terrainRenderer } from '$lib/GameData/terrain'
	import { skyData, skyRenderer } from '$lib/GameData/sky'
	import { attacksRenderer, unitData, unitRenderer } from '$lib/GameData/unit'
	import { buildingData, buildingRenderer } from '$lib/GameData/building'
	import { rendererStore } from '$lib/Sprites/spriteStore'
	import type { imageColorizer } from '$lib/Sprites/imageColorizer'
	import type { createImageLoader } from '$lib/Sprites/images'
	import { animationData, animationRenderer } from '$lib/GameData/animation'
	import { get } from 'svelte/store'
	import { gameState } from './gameState'
	import { onMatchEnd } from './matchEnd'
	import { outgoingActions } from './outgoingActions'
	import { createCampaignRunner } from '$lib/Campaign/campaignRunner'
	import { createCampaignInterface } from '$lib/Campaign/campaignInterface'
	import { upcomingSpawns } from '$lib/Campaign/spawnTelegraph'
	import { repaintSignal } from '$lib/Engine/Animator/animator'
	import { scriptReferencedTypeIndices } from '$lib/Campaign/cutsceneScript'
	import { mineReachableTerrainTypes } from '$lib/Engine/modifiers/miner'
	import { burnResultTerrainTypes } from '$lib/Engine/modifiers/burn'
	import { beginScriptBlock, endScriptBlock, resetScriptGate } from '$lib/Campaign/scriptGate'
	import {
		currentCampaignLevelId,
		computeSignature,
		captureSnapshot,
		applySnapshot,
		loadSnapshot,
		saveSnapshot,
		clearSnapshot,
		type CampaignSnapshot,
	} from '$lib/Campaign/campaignSave'
	import Dialogue from '$lib/Campaign/Dialogue.svelte'
	import ResumePrompt from '$lib/Campaign/ResumePrompt.svelte'
	import type { CutsceneScript } from '$lib/Campaign/cutsceneTypes'

	export let map: MapObject
	export let colorizer: ReturnType<typeof imageColorizer>
	export let makeImage: ReturnType<typeof createImageLoader>
	export let select = (x: number, y: number) => {}
	/** When set, this level is a scripted campaign level (K1 parse output). */
	export let campaign: CutsceneScript | undefined = undefined
	/** Map-editor mode: warm every terrain/weather sprite up front so a freshly
	 * painted type (one not yet present on the map) never renders as a blank tile. */
	export let editor = false

	let validTile = (x: number, y: number) => x < map.cols && y < map.rows

	// Resume-on-refresh prompt (campaign only). Populated when a valid in-progress
	// save is found on mount; the match stays frozen behind the script gate until
	// the player chooses Resume or Start over.
	let resumePrompt: {
		open: boolean
		turnNumber: number
		savedAt: number
		onResume: () => void
		onRestart: () => void
	} = { open: false, turnNumber: 1, savedAt: 0, onResume: () => {}, onRestart: () => {} }

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
		const withScript = (included: number[], extra: number[]) => [
			...new Set([...included, ...extra]),
		]

		// Mining swaps a deposit's ground type mid-match (Enriched → Ore → Depleted),
		// so also preload every tier reachable from the deposits actually present —
		// same blank-tile failure mode as script-swapped terrain otherwise.
		// The editor palette can paint any type, so warm them all — same blank-tile
		// failure mode as script-swapped terrain, but for every unused type at once.
		const groundTypes = editor
			? terrainData.map((_, index) => index)
			: withScript(map.filters.ground(map.layers.ground), scriptTypes.ground)
		// A Scorcher burns Forest to Charred Forest mid-match; warm that result too or
		// a freshly-scorched tile paints blank (same failure mode as mining above).
		const mutableGround = withScript(
			mineReachableTerrainTypes(groundTypes),
			burnResultTerrainTypes(groundTypes)
		)

		rendererStore.update((store) => ({
			ground: {
				...store.ground,
				...ground(withScript(groundTypes, mutableGround)),
			},
			sky: {
				...store.sky,
				...sky(
					editor
						? skyData.map((_, index) => index)
						: withScript(map.filters.sky(map.layers.sky), scriptTypes.sky)
				),
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
				...buildings(
					editor
						? buildingData.map((_, index) => index)
						: withScript(map.filters.buildings(map.layers.buildings), scriptTypes.buildings)
				),
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
		// Only the scripted board runs this. `campaign` is the same discriminator that
		// has always kept the paused minimap MapRender (which mounts its own `Game`
		// with no `campaign`) from running scripts — gating on it here likewise keeps
		// the minimap from spawning a second resume prompt / raising the freeze gate.
		if (!campaign) return

		const runner = createCampaignRunner(campaign, createCampaignInterface({ map }))

		// Mid-match save/resume is keyed by campaign level id. It stays null for editor
		// maps that merely embed a script (`map.script`) — those get scripting but no
		// save, since they aren't a campaign level with a stable id to resume under.
		const levelId = get(currentCampaignLevelId)

		// Signature of the pristine board (nothing has mutated it yet on mount), so a
		// redesigned level discards its now-stale save instead of restoring onto it.
		const signature = levelId ? computeSignature(map, levelId) : ''

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

		// Persist the whole match (board + engine state + smoke + cutscene progress)
		// after every mutation. No-op once the match is over — the terminal state is
		// cleared, not saved, so a finished level never offers a resume.
		let saveEnabled = !!levelId
		const saveNow = () => {
			if (!saveEnabled || !levelId) return
			if (get(gameState).phase !== 'playing') return
			saveSnapshot(levelId, captureSnapshot(map, signature, runner.serialize()))
		}

		let lastKey = ''
		let offTurn: (() => void) | undefined
		let offMatchEnd: (() => void) | undefined
		let offOutgoing: (() => void) | undefined

		// Wire the live match: telegraph + per-turn cutscene blocks, the match-end
		// win/lose block, and the after-every-action save. Called once the player has
		// resolved any resume prompt (or immediately when there's nothing to resume).
		const begin = () => {
			offTurn = gameState.subscribe((state) => {
				const round = state.turnNumber - 1
				const team = state.currentTeam
				const key = `${round}:${team}`
				if (key !== lastKey) {
					lastKey = key
					// Telegraph: look ahead at the script and mark the tiles where each
					// team's reinforcements will land on their next turn. Purely an
					// indicator (owner-only marker + CPU planning); the spawns still fire
					// when their own turn block runs. Recomputed on every side-turn so a
					// team eliminated mid-match, or a spawn that just landed, drops out.
					map.scheduledSpawns = upcomingSpawns(
						campaign,
						state.players,
						team,
						state.turnNumber,
						map.cols
					)
					repaintSignal.update((n) => n + 1)
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
						// Scripted beats mutate the board outside the action log, so snapshot
						// after they settle.
						saveNow()
					})()
				}
			})

			// Every committed player/CPU action emits here *after* it has applied, so
			// this captures the post-move board.
			let primed = false
			offOutgoing = outgoingActions.subscribe(() => {
				// The store replays its current value on subscribe — skip that stale beat.
				if (!primed) {
					primed = true
					return
				}
				saveNow()
			})

			// `finish` plays win/lose; the match is already over so the gate is belt-and-
			// suspenders, but it keeps the CPU from queuing one last move under the block.
			offMatchEnd = onMatchEnd((result) => {
				// The level is decided — drop the resume save so a win advances and a loss
				// retries from a clean board rather than the near-defeat state.
				saveEnabled = false
				if (levelId) clearSnapshot(levelId)
				const won = result.players.find((p) => p.isLocal)?.outcome === 'win'
				void runGated(won ? campaign.win : campaign.lose, () => runner.finish(result))
			})
		}

		const startFresh = () => {
			void runGated(campaign.start, () => runner.start())
			begin()
		}

		const resume = (snap: CampaignSnapshot) => {
			applySnapshot(map, snap)
			if (snap.runner) runner.restore(snap.runner)
			repaintSignal.update((n) => n + 1)
			begin()
		}

		const saved = levelId ? loadSnapshot(levelId, signature) : null
		if (saved) {
			// Freeze the match and let the player choose. The gate is released when they
			// pick, right before the chosen path wires the live match up.
			beginScriptBlock()
			resumePrompt = {
				open: true,
				turnNumber: saved.turnNumber,
				savedAt: saved.savedAt,
				onResume: () => {
					resumePrompt = { ...resumePrompt, open: false }
					// Restore + wire the live subscriptions first, then drop the freeze — so
					// a resume mid-CPU-turn can't schedule a CPU move before the per-turn
					// cutscene subscription is attached.
					resume(saved)
					endScriptBlock()
				},
				onRestart: () => {
					resumePrompt = { ...resumePrompt, open: false }
					if (levelId) clearSnapshot(levelId)
					endScriptBlock()
					startFresh()
				},
			}
		} else {
			startFresh()
		}

		return () => {
			offTurn?.()
			offMatchEnd?.()
			offOutgoing?.()
			// A level torn down mid-block (navigating away during dialogue, or before a
			// resume choice) must not leave the shared gate raised for the next mount.
			resetScriptGate()
		}
	})
</script>

<slot {interfacer} {select} {validTile} {renderData}></slot>

{#if campaign}
	<Dialogue />
{/if}

<ResumePrompt
	open={resumePrompt.open}
	turnNumber={resumePrompt.turnNumber}
	savedAt={resumePrompt.savedAt}
	onResume={resumePrompt.onResume}
	onRestart={resumePrompt.onRestart}
/>
