<!--
	Dialogue — the campaign dialogue overlay.

	Renders the current line from `dialogueState`. Clicking anywhere advances to
	the next line (and resolves the runner's `talk` promise after the last one);
	the Skip button dismisses the whole set at once. It only intercepts input
	while a line is showing, so between scripted beats the player keeps normal
	control of the match.
-->
<script lang="ts">
	import { dialogueState, advanceDialogue, skipDialogue } from './dialogueStore'

	$: state = $dialogueState
	$: line = state.lines[state.index] ?? ''
	$: hasMore = state.index < state.lines.length - 1
</script>

{#if state.active}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="fixed inset-x-0 bottom-0 z-[70] flex justify-center p-4"
		data-testid="dialogue-overlay"
		on:click={advanceDialogue}
	>
		<div
			class="pointer-events-auto w-full max-w-2xl rounded bg-black/90 p-4 font-mono text-white shadow-lg"
		>
			<div class="flex items-baseline justify-between gap-3">
				<span class="text-sm font-bold text-yellow-300" data-testid="dialogue-speaker">
					{state.speaker}
				</span>
				<button
					type="button"
					class="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
					data-testid="dialogue-skip"
					on:click|stopPropagation={skipDialogue}
				>
					Skip
				</button>
			</div>
			<p class="mt-2 text-sm leading-relaxed" data-testid="dialogue-text">
				{line}
			</p>
			<div class="mt-2 text-right text-xs opacity-60" data-testid="dialogue-advance">
				{hasMore ? 'click to continue ▸' : 'click to close ▸'}
			</div>
		</div>
	</div>
{/if}
