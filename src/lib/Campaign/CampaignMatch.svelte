<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { browser } from '$app/environment'
	import GameBoard from '$lib/Map/GameBoard.svelte'
	import GameSocket from '$lib/Components/Socket/GameSocket.svelte'
	import GameStateManager from '$lib/Engine/GameStateManager.svelte'
	import { socketEndTurn, socketSelect } from '$lib/Components/Socket/socket'
	import { deriveFromHash } from '$lib/Map/Editor/mapExporter'
	import { unitData } from '$lib/GameData/unit'
	import { gameState } from '$lib/Engine/gameState'
	import { parseCutsceneScript } from './cutsceneScript'
	import { currentCampaignLevelId } from './campaignSave'
	import { getLevelMap, getLevelScriptText } from './levelContent'
	import type { CutsceneScript } from './cutsceneTypes'
	import type { CampaignLevel } from './levels'

	/** The level to host. Re-mounted by the route via `{#key levelId}` per level. */
	export let level: CampaignLevel
	/** Campaign win → advance. The route decides next-level vs campaign-complete. */
	export let onContinue: (() => void) | undefined = undefined
	/** Campaign loss → reload this same level cleanly. */
	export let onRetry: (() => void) | undefined = undefined

	// Single-player is always team 0 vs CPU(s). A non-multiplayer game session makes
	// GameSocket fall back to its LocalInteracter, so the match runs entirely
	// client-side with no server round-trips.
	const localTeam = 0
	const gameSession = 'ephemeral'

	/**
	 * Resolve the level's board. K5 ships each level as `./levels/<id>.json`
	 * (bundled by `levelContent.ts`). A level without an authored map falls back
	 * to a minimal two-team placeholder so the shell still mounts a genuine match
	 * (players, treasury, a CPU opponent) and the navigation flow stays
	 * exercisable end to end.
	 */
	const stubMap = (): MapObject => {
		const base = deriveFromHash(undefined)
		const cols = base.cols
		const rows = base.rows
		const unitType = 0
		const health = unitData[unitType]?.health ?? 10
		const units: (UnitObject | null)[] = []
		units[0] = { type: unitType, state: 0, team: 0, health } as UnitObject
		units[(rows - 1) * cols + (cols - 1)] = {
			type: unitType,
			state: 0,
			team: 1,
			health,
		} as UnitObject

		return {
			...base,
			layers: {
				ground: base.layers.ground.map((g) => ({ ...g })),
				sky: [],
				units,
				buildings: [],
			},
			highlights: [],
			route: [],
		} as MapObject
	}

	const map: MapObject = getLevelMap(level.id) ?? stubMap()

	// Mark this as a campaign match (and which level) so the engine layer enables
	// mid-match save/resume. Set here in the component body — not in `onMount` — so
	// it is in place before this match's deeply-nested `Game` child mounts and reads
	// it (child `onMount` runs before this parent's). Cleared on teardown so a later
	// online/hotseat match on the same page never inherits campaign resume.
	if (browser) currentCampaignLevelId.set(level.id)
	onDestroy(() => {
		if (browser) currentCampaignLevelId.set(null)
	})

	// K1/K2: parse the level's script up front (bundled content is synchronous) and
	// hand it to `Game` via `MapRender`. `Game` owns the canonical campaign wiring —
	// it runs the `start` block on mount, fires each turn's block off the engine's
	// turn counter, and plays `win`/`lose` off the J1 match-end hook — and renders
	// the dialogue overlay. Levels with no script run nothing extra.
	const parseScript = (): CutsceneScript | undefined => {
		const text = getLevelScriptText(level.id)
		if (!text) return undefined
		try {
			return parseCutsceneScript(text)
		} catch {
			// A malformed script should never brick the level; play it scriptless.
			return undefined
		}
	}

	const campaign: CutsceneScript | undefined = parseScript()

	onMount(() => {
		// Test-only hook: drive the match to a terminal state without playing it
		// out, so the campaign navigation (Continue/auto-advance and Retry) can be
		// verified by the Playwright smoke. Local single-player only — there is no
		// server authority to subvert here.
		const w = window as unknown as Record<string, unknown>
		w.__thunderliteCampaign = {
			win: () => gameState.update((s) => ({ ...s, phase: 'gameOver', winner: localTeam })),
			lose: () =>
				gameState.update((s) => ({
					...s,
					phase: 'gameOver',
					winner: localTeam === 0 ? 1 : 0,
				})),
		}

		return () => {
			if (w.__thunderliteCampaign) delete w.__thunderliteCampaign
		}
	})
</script>

<GameSocket map={() => map} {gameSession} let:socket let:requestRedraw>
	<GameStateManager
		{map}
		{gameSession}
		{localTeam}
		mode="campaign"
		campaignLevelId={level.id}
		minimap
		{onContinue}
		{onRetry}
		interactor={socket ? socketSelect(socket, () => map) : undefined}
		endTurnAction={socket ? socketEndTurn(socket, () => map) : undefined}
		let:select
	>
		<GameBoard {map} {requestRedraw} {select} {campaign} {localTeam} menuHref="/campaign" />
	</GameStateManager>
</GameSocket>
