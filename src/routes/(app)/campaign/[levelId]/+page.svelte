<script lang="ts">
	import { browser } from '$app/environment'
	import { goto } from '$app/navigation'
	import { page } from '$app/stores'
	import { onMount } from 'svelte'
	import CampaignMatch from '$lib/Campaign/CampaignMatch.svelte'
	import { getLevelById, getLevelByOrder } from '$lib/Campaign/levels'
	import { isUnlocked } from '$lib/Campaign/progress'

	$: levelId = $page.params.levelId ?? ''
	$: level = getLevelById(levelId)

	// A locked or unknown level can't be launched directly. Progress is read from
	// the local mirror (guest bucket — see progress.ts), so this runs client-side.
	onMount(() => {
		if (!browser) return
		if (!level || !isUnlocked(level.id, undefined)) {
			void goto('/campaign')
		}
	})

	// Campaign win → auto-advance. K3 has already unlocked the next level off the
	// J1 hook, so Continue routes straight into the next level's host route. The
	// last level routes back to the campaign screen in its "complete" state.
	const handleContinue = () => {
		if (!level) return
		const next = getLevelByOrder(level.order + 1)
		void goto(next ? `/campaign/${next.id}` : '/campaign?complete=1')
	}

	// Campaign loss → reload the same level cleanly from scratch.
	const handleRetry = () => {
		if (browser) location.reload()
	}
</script>

<svelte:head>
	<title>{level ? `Campaign — ${level.title}` : 'Campaign'}</title>
</svelte:head>

{#key levelId}
	{#if level}
		<section class="h-screen overflow-clip" data-testid="campaign-match" data-level-id={level.id}>
			<CampaignMatch {level} onContinue={handleContinue} onRetry={handleRetry} />
		</section>
	{/if}
{/key}
