<!--
	ResumePrompt — offered on entering a campaign level that has an in-progress
	save (e.g. after an accidental refresh). Resume restores the saved board and
	turn; Restart discards the save and plays the level from its opening. The
	match is frozen behind the script gate while this is up, so neither the player
	nor the CPU can act until a choice is made.
-->
<script lang="ts">
	interface Props {
		open?: boolean
		turnNumber?: number
		savedAt?: number
		onResume?: () => void
		onRestart?: () => void
	}

	let {
		open = false,
		turnNumber = 1,
		savedAt = 0,
		onResume = () => {},
		onRestart = () => {},
	}: Props = $props()

	const relativeTime = (ts: number): string => {
		const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000))
		if (seconds < 60) return 'moments ago'
		const minutes = Math.round(seconds / 60)
		if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
		const hours = Math.round(minutes / 60)
		if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
		const days = Math.round(hours / 24)
		return `${days} day${days === 1 ? '' : 's'} ago`
	}
	// A friendly "how long ago" so the player recognises the save as theirs.
	let ago = $derived(savedAt ? relativeTime(savedAt) : '')
</script>

{#if open}
	<div
		class="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
		data-testid="resume-prompt"
	>
		<div
			class="w-full max-w-sm rounded border border-white/15 bg-black/90 p-5 font-mono text-white shadow-xl"
		>
			<h2 class="text-base font-bold">Resume this level?</h2>
			<p class="mt-2 text-sm leading-relaxed opacity-80">
				Saved at turn {turnNumber}{ago ? ` · ${ago}` : ''}
			</p>
			<div class="mt-5 flex flex-col gap-2">
				<button
					type="button"
					class="cursor-pointer rounded bg-white px-3 py-2 text-sm font-bold text-black hover:bg-white/90"
					data-testid="resume-continue"
					onclick={onResume}
				>
					Resume
				</button>
				<button
					type="button"
					class="cursor-pointer rounded bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
					data-testid="resume-restart"
					onclick={onRestart}
				>
					Start over
				</button>
			</div>
		</div>
	</div>
{/if}
