<!--
	Dialogue — the campaign dialogue overlay.

	Renders the current line from `dialogueState`. Clicking anywhere advances to
	the next line (and resolves the runner's `talk` promise after the last one);
	the Skip button skips the rest of this script block's dialogue in one click
	(the next speaker and any beyond), while spawns/camera/waits still play out.
	It only intercepts input while a line is showing, so between scripted beats
	the player keeps normal control of the match.
-->
<script lang="ts">
	import { dialogueState, advanceDialogue, skipDialogue } from './dialogueStore'
	import { speakerColorOverrides, resolveSpeakerColor } from './speakerColors'
	import { hudGutter } from '$lib/Engine/HUD/hudInsets'

	let state = $derived($dialogueState)
	let line = $derived(state.lines[state.index] ?? '')
	let hasMore = $derived(state.index < state.lines.length - 1)
	// Resolve the speaker's voice colour (script override → built-in → default) and
	// derive a lighter, readable tint of it for the line text.
	let color = $derived(resolveSpeakerColor(state.speaker, $speakerColorOverrides))
	let textColor = $derived(`color-mix(in oklab, ${color} 55%, white)`)
</script>

{#if state.active}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<!-- Spans the board region only (left of the HUD rail, see hudInsets) and
	     sits under the chrome, so the box centres on the *board*, never covers
	     the turn controls, and leaves the chat docks clickable mid-cutscene. -->
	<div
		class="fixed bottom-0 left-0 z-32 flex justify-center p-4"
		style="right: {$hudGutter}px"
		data-testid="dialogue-overlay"
		onclick={advanceDialogue}
	>
		<div
			class="pointer-events-auto w-full max-w-2xl cursor-pointer rounded border-l-4 bg-black/90 p-4 font-mono text-white shadow-lg"
			style="border-color: {color}"
		>
			<div class="flex items-baseline justify-between gap-3">
				<span class="text-sm font-bold" style="color: {color}" data-testid="dialogue-speaker">
					{state.speaker}
				</span>
				<button
					type="button"
					class="rounded cursor-pointer bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
					data-testid="dialogue-skip"
					onclick={(e) => {
						e.stopPropagation()
						skipDialogue()
					}}
				>
					Skip
				</button>
			</div>
			<p
				class="mt-2 text-sm leading-relaxed"
				style="color: {textColor}"
				data-testid="dialogue-text"
			>
				{line}
			</p>
			<div class="mt-2 text-right text-xs opacity-60" data-testid="dialogue-advance">
				{hasMore ? 'click to continue ▸' : 'click to close ▸'}
			</div>
		</div>
	</div>
{/if}
