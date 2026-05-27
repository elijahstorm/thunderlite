<script lang="ts">
	import StatsPanel from '$lib/Components/Profile/StatsPanel.svelte'

	export let data
	$: user = data.user
	$: stats = data.stats
</script>

<section class="mx-auto w-full max-w-3xl px-4 py-8 space-y-6">
	<header>
		<p class="section-eyebrow">Player</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">
			{user.display_name || user.username || 'Player'}
		</h1>
		{#if user.username}
			<p class="text-sm text-muted-foreground mt-1">@{user.username}</p>
		{/if}
		{#if user.bio}
			<p class="text-sm text-muted-foreground mt-2">{user.bio}</p>
		{/if}
	</header>

	<StatsPanel {stats} heading="Match record" />
</section>
