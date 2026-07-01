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

	$: state = $dialogueState
	$: line = state.lines[state.index] ?? ''
	$: hasMore = state.index < state.lines.length - 1
	// Resolve the speaker's voice colour (script override → built-in → default) and
	// derive a lighter, readable tint of it for the line text.
	$: color = resolveSpeakerColor(state.speaker, $speakerColorOverrides)
	$: textColor = `color-mix(in oklab, ${color} 55%, white)`
</script>

{#if state.active}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="fixed inset-x-0 bottom-0 z-[70] flex justify-center p-4"
		data-testid="dialogue-overlay"
		on:click={advanceDialogue}
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
					on:click|stopPropagation={skipDialogue}
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
