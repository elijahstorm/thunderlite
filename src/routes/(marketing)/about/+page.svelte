<script lang="ts">
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import Icon from '@iconify/svelte'

	const pillars = [
		{
			icon: 'lucide:swords',
			title: 'Tactics over twitch',
			body: 'Every move is deliberate. Terrain, vision, and unit synergy are the puzzle; reflexes never enter the picture.',
		},
		{
			icon: 'lucide:globe-2',
			title: 'Browser-native',
			body: 'No download, no installer, no platform lock-in. Open a tab and you are in the field.',
		},
		{
			icon: 'lucide:users-round',
			title: 'Play together, anytime',
			body: 'Share a session code. Your friend takes their turn whenever they get the chance: async, but live when you want it.',
		},
		{
			icon: 'lucide:hammer',
			title: 'A community of cartographers',
			body: 'The map editor is core, not a side feature. Every player can author and publish.',
		},
	]
</script>

<Casing>
	<section class="max-w-3xl mx-auto py-8 space-y-6">
		<p class="section-eyebrow">About ThunderLite</p>
		<h1 class="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground leading-tight">
			A love letter to <span class="text-primary">Battalion: Arena</span>.
		</h1>
		<p class="text-lg text-muted-foreground leading-relaxed">
			ThunderLite is a browser-based recreation of Urban Squall's Battalion: Arena, a turn-based
			tactics game in the Advance Wars family. It's free, open, and built for the players who never
			stopped loving the genre.
		</p>
	</section>

	<section class="max-w-4xl mx-auto pt-8 pb-12">
		<div class="grid sm:grid-cols-2 gap-4">
			{#each pillars as p (p.title)}
				<div class="card p-6">
					<div
						class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"
					>
						<Icon icon={p.icon} width={20} />
					</div>
					<h3 class="mt-4 font-semibold text-foreground">{p.title}</h3>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">{p.body}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="max-w-3xl mx-auto py-8 space-y-5 text-muted-foreground leading-relaxed">
		<h2 class="text-2xl font-semibold tracking-tight text-foreground">Why ThunderLite exists</h2>
		<p>
			Browser flash games shaped a generation of strategy fans, and Battalion: Arena was one of the
			best of them. When Flash sunset, that whole library went dark. ThunderLite is one small
			attempt to bring that genre forward, with the same patient, thoughtful pacing, in a modern stack that
			just runs.
		</p>
		<p>
			It is built and maintained by one person, in the open. There is no monetization, no tracking
			beyond the basics required to keep the lights on, and no plan to introduce either.
		</p>
		<div class="pt-2 flex flex-wrap items-center gap-3">
			<a href="/login" class="btn btn-primary">
				<Icon icon="lucide:play" width={16} />
				Jump into a game
			</a>
			<a href="/editor" class="btn btn-outline">
				<Icon icon="lucide:hammer" width={16} />
				Build a map
			</a>
			<a href="/make" class="btn btn-outline">Browse community maps</a>
		</div>
	</section>
</Casing>
