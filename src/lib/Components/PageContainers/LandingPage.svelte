<script lang="ts">
	import { browser } from '$app/environment'
	import { writable, type Readable } from 'svelte/store'
	import Icon from '@iconify/svelte'

	let loggedIn: Readable<boolean> = writable(false)

	if (browser) {
		import('$lib/dontcode/client').then((m) => (loggedIn = m.loggedIn))
	}

	const features = [
		{
			icon: 'lucide:swords',
			title: 'Turn-based tactics',
			body: 'Plan every move. Terrain, line-of-sight, and unit synergy decide the battle, not reflexes.',
		},
		{
			icon: 'lucide:users',
			title: 'Async multiplayer',
			body: 'Share a session code with a friend. Take your turn whenever — your opponent picks up where you left off.',
		},
		{
			icon: 'lucide:hammer',
			title: 'Built-in map editor',
			body: 'Paint terrain, place HQs, save and share. Every map becomes a new puzzle for the community.',
		},
	]
</script>

<section class="relative overflow-hidden">
	<div
		class="pointer-events-none absolute inset-0 grid-pattern mask-fade-top-bottom opacity-60"
	></div>
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-linear-to-b from-accent/60 via-transparent to-transparent"
	></div>

	<div class="container relative pt-16 pb-20 lg:pt-28 lg:pb-28">
		<div class="grid lg:grid-cols-12 gap-12 items-center">
			<div class="lg:col-span-7 space-y-7">
				<span
					class="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
					Browser-native tactics, no install required
				</span>

				<h1
					class="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground leading-[1.05]"
				>
					Command the squad.
					<span class="block text-primary">Hold the line.</span>
				</h1>

				<p class="text-lg text-muted-foreground max-w-xl leading-relaxed">
					ThunderLite is a love letter to Battalion: Arena — a turn-based tactics game in the
					Advance Wars family. Play live in the browser, design your own maps, and challenge your
					friends.
				</p>

				<div class="flex flex-wrap items-center gap-3 pt-2">
					<!-- Two clearly separate modes. Single Player (campaign) is its own
						 path → /campaign; multiplayer "Get started" is the live session → /play. -->
					<a class="btn btn-primary btn-lg" href="/campaign" data-testid="cta-single-player">
						<Icon icon="lucide:flag" width={18} />
						Single Player
					</a>
					<a
						class="btn btn-primary btn-lg"
						href={$loggedIn ? '/play' : '/login'}
						data-testid="cta-multiplayer"
					>
						<Icon icon="lucide:users" width={18} />
						Get started
					</a>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<a class="btn btn-outline btn-lg" href="/make">
						Browse maps
						<Icon icon="lucide:arrow-right" width={16} />
					</a>
					<a class="btn btn-ghost btn-lg" href="/editor">
						<Icon icon="lucide:hammer" width={18} />
						Build a map
					</a>
				</div>

				<div class="flex items-center gap-6 pt-6 text-xs text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<Icon icon="lucide:check" width={14} class="text-primary" />
						Free to play
					</span>
					<span class="flex items-center gap-1.5">
						<Icon icon="lucide:check" width={14} class="text-primary" />
						No download
					</span>
					<span class="flex items-center gap-1.5">
						<Icon icon="lucide:check" width={14} class="text-primary" />
						Async multiplayer
					</span>
				</div>
			</div>

			<div class="lg:col-span-5">
				<div
					class="relative rounded-2xl border border-border bg-surface shadow-[0_30px_80px_-30px_rgba(15,42,52,0.25)] overflow-hidden"
				>
					<div class="aspect-5/4 bg-surface-2">
						<img
							src="/images/embedded-card.png"
							alt="ThunderLite gameplay"
							class="h-full w-full object-cover"
						/>
					</div>
					<div
						class="absolute bottom-3 left-3 right-3 rounded-xl border border-border bg-background/85 backdrop-blur px-4 py-3 flex items-center gap-3"
					>
						<span class="h-2 w-2 rounded-full bg-primary"></span>
						<div class="text-sm">
							<span class="font-medium text-foreground">Live multiplayer</span>
							<span class="text-muted-foreground"> — share a code, take your turn</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each features as f (f.title)}
				<div class="card p-6">
					<div
						class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"
					>
						<Icon icon={f.icon} width={20} />
					</div>
					<h3 class="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
				</div>
			{/each}
		</div>
	</div>
</section>
