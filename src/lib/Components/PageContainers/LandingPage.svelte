<script lang="ts">
	import { browser } from '$app/environment'
	import { writable, type Readable } from 'svelte/store'
	import Icon from '@iconify/svelte'

	let loggedIn: Readable<boolean> = $state(writable(false))

	if (browser) {
		import('$lib/dontcode/client').then((m) => (loggedIn = m.loggedIn))
	}

	// Unequal on purpose. The adaptive CPU is the reason to try this over the
	// original, so it gets the room; the rest are worth a line each and are
	// listed rather than dressed up as identical cards.
	const secondary = [
		{
			icon: 'lucide:cloud-rain-wind',
			title: 'Weather and terrain that matter',
			body: 'Height decides sight lines. Storms change movement and cover mid-match.',
		},
		{
			icon: 'lucide:map',
			title: 'Maps up to 500×500',
			body: 'Room for real fronts, flanks, and logistics. Smooth the whole way.',
		},
	]

	const rest = [
		{
			icon: 'lucide:users',
			title: 'Multiplayer at your pace',
			body: 'Live with turn timers, or trade turns over days.',
		},
		{
			icon: 'lucide:hammer',
			title: 'A real map editor',
			body: 'Paint terrain, script events, publish to the community.',
		},
		{
			icon: 'lucide:flag',
			title: 'Jump in without an account',
			body: 'The campaign starts the moment the page loads.',
		},
		{
			icon: 'lucide:swords',
			title: 'Armor matchups, not reflexes',
			body: 'What you send decides the fight before either side rolls.',
		},
	]
</script>

<section class="relative">
	<div class="container relative pt-14 pb-14 lg:pt-20 lg:pb-16">
		<div class="grid lg:grid-cols-12 gap-12 items-center">
			<div class="lg:col-span-7 space-y-7">
				<h1 class="text-5xl sm:text-6xl lg:text-7xl uppercase text-foreground">
					Command the squad.
					<span class="block text-secondary">Hold the line.</span>
				</h1>

				<p class="text-lg text-foreground/85 max-w-xl leading-relaxed">
					A rebuild of Battalion: Arena. Turn-based tactics in the Advance Wars family.
				</p>

				<div class="flex flex-wrap items-center gap-3 pt-1">
					<!-- Two clearly separate modes. Single Player (campaign) is its own
						 path → /campaign; multiplayer is the live session → /games. -->
					<a class="btn btn-primary btn-lg" href="/campaign" data-testid="cta-single-player">
						<Icon icon="lucide:flag" width={18} />
						Single Player
					</a>
					<a
						class="btn btn-secondary btn-lg"
						href={$loggedIn ? '/games' : '/login'}
						data-testid="cta-multiplayer"
					>
						<Icon icon="lucide:users" width={18} />
						Play a friend
					</a>
					<a class="btn btn-ghost btn-lg" href="/editor">
						<Icon icon="lucide:hammer" width={18} />
						Build a map
					</a>
				</div>

				<p class="text-sm text-muted-foreground">
					Free. No install. Single player needs no account.
				</p>
			</div>

			<div class="lg:col-span-5">
				<!-- Corner marks frame the plate; the bar under it is the one piece of
					 real information the image cannot state on its own. -->
				<figure class="bracketed bracketed-primary border border-border-strong bg-surface p-2">
					<div class="relative aspect-5/4 overflow-hidden bg-surface-2">
						<img
							src="/images/embedded-card.png"
							alt="A ThunderLite match in progress: infantry and armor across wooded terrain"
							class="h-full w-full object-cover"
						/>
					</div>
					<figcaption
						class="mt-2 flex items-center gap-2.5 px-1 pb-0.5 text-sm text-muted-foreground"
					>
						<span class="h-1.5 w-1.5 bg-secondary"></span>
						<span><span class="text-foreground">Live multiplayer.</span> Share a code and go.</span>
					</figcaption>
				</figure>
			</div>
		</div>

		<div class="mt-24 grid gap-5 lg:grid-cols-3">
			<div class="panel lg:col-span-2 p-6 lg:p-8 flex flex-col justify-center">
				<h2 class="text-3xl sm:text-4xl text-foreground">An AI that pays attention</h2>
				<p class="mt-4 text-base text-foreground/85 leading-relaxed max-w-2xl">
					The CPU reads the position instead of running a script: it values ground, armor matchups
					and what it can actually see. Raise the difficulty and it searches further ahead rather
					than just hitting harder.
				</p>
				<a class="btn btn-outline mt-6 self-start" href="/campaign">
					Take the first mission
					<Icon icon="lucide:arrow-right" width={16} />
				</a>
			</div>

			<div class="grid gap-5">
				{#each secondary as f (f.title)}
					<div class="panel p-5">
						<h3 class="flex items-center gap-2 text-lg text-foreground">
							<Icon icon={f.icon} width={17} class="text-primary shrink-0" />
							{f.title}
						</h3>
						<p class="mt-2 text-sm text-foreground/75 leading-relaxed">{f.body}</p>
					</div>
				{/each}
			</div>
		</div>

		<ul class="mt-8 grid sm:grid-cols-2 gap-x-10 border-t border-border">
			{#each rest as f (f.title)}
				<li class="flex gap-3 py-5 border-b border-border">
					<Icon icon={f.icon} width={17} class="mt-1 text-primary shrink-0" />
					<div>
						<h3 class="text-base text-foreground">{f.title}</h3>
						<p class="mt-1 text-sm text-foreground/75 leading-relaxed">{f.body}</p>
					</div>
				</li>
			{/each}
		</ul>
	</div>
</section>
