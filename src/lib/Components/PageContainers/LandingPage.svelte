<script lang="ts">
	import { browser } from '$app/environment'
	import { writable, type Readable } from 'svelte/store'
	import Icon from '@iconify/svelte'

	let loggedIn: Readable<boolean> = $state(writable(false))

	if (browser) {
		import('$lib/dontcode/client').then((m) => (loggedIn = m.loggedIn))
	}

	const features = [
		{
			icon: 'lucide:brain-circuit',
			title: 'An AI that pays attention',
			body: 'The CPU reacts to how you play, not a fixed script.',
		},
		{
			icon: 'lucide:map',
			title: 'Maps up to 500×500',
			body: 'Room for real fronts, flanks, and logistics. Smooth the whole way.',
		},
		{
			icon: 'lucide:cloud-rain-wind',
			title: 'Weather and terrain that matter',
			body: 'Height decides sight lines. Storms change movement and cover mid-match.',
		},
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
	]

	// Read as the spec table stamped on the inside cover of the manual.
	const spec = [
		{ label: 'Cost', value: 'Free' },
		{ label: 'Install', value: 'None' },
		{ label: 'Solo', value: 'No account' },
		{ label: 'Versus', value: 'Live + async' },
		{ label: 'Map size', value: 'Up to 500×500' },
		{ label: 'Source', value: 'On GitHub' },
	]
</script>

<section class="relative overflow-hidden">
	<div
		class="pointer-events-none absolute inset-0 grid-pattern mask-fade-top-bottom opacity-70"
	></div>
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-[50vh] bg-linear-to-b from-accent/50 via-transparent to-transparent"
	></div>

	<div class="container relative pt-14 pb-20 lg:pt-20 lg:pb-28">
		<div class="grid lg:grid-cols-12 gap-12 items-center">
			<div class="lg:col-span-7 space-y-7">
				<div class="flex flex-wrap items-center gap-3">
					<span class="stamp stamp-primary stamp-tilt">Browser-native tactics</span>
					<span class="marginalia">SEC. 01 &middot; BRIEFING</span>
				</div>

				<h1 class="text-5xl sm:text-6xl lg:text-7xl text-foreground">
					Command the squad.
					<span class="block text-secondary">Hold the line.</span>
				</h1>

				<div class="rule-dashed max-w-xl"></div>

				<p class="text-lg text-muted-foreground max-w-xl leading-relaxed">
					A rebuild of Battalion: Arena. Turn-based tactics in the Advance Wars family.
				</p>

				<div class="flex flex-wrap items-center gap-3 pt-2">
					<!-- Two clearly separate modes. Single Player (campaign) is its own
						 path → /campaign; multiplayer "Get started" is the live session → /play. -->
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

				<!-- Issue specs, set as a typed table rather than a row of checkmarks. -->
				<dl
					class="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-px border border-border bg-border overflow-hidden"
				>
					{#each spec as item (item.label)}
						<div class="bg-surface px-3 py-2.5">
							<dt class="marginalia text-[9px]">{item.label}</dt>
							<dd
								class="mt-0.5 text-sm font-semibold text-foreground font-display uppercase tracking-[0.06em]"
							>
								{item.value}
							</dd>
						</div>
					{/each}
				</dl>
			</div>

			<div class="lg:col-span-5">
				<!-- Plate 01, framed with crop marks and captioned like a figure. -->
				<figure class="bracketed bracketed-primary border border-border-strong bg-surface p-2">
					<div class="relative aspect-5/4 overflow-hidden bg-surface-2">
						<img
							src="/images/embedded-card.png"
							alt="ThunderLite gameplay"
							class="h-full w-full object-cover"
						/>
						<div
							class="absolute bottom-0 inset-x-0 border-t border-border-strong bg-background/92 backdrop-blur px-3 py-2 flex items-center gap-2.5"
						>
							<span class="h-1.5 w-1.5 bg-secondary"></span>
							<div class="text-sm">
								<span class="font-display font-semibold uppercase tracking-[0.08em]">
									Live multiplayer
								</span>
								<span class="text-muted-foreground">: share a code, take your turn</span>
							</div>
						</div>
					</div>
					<figcaption class="mt-2 flex items-center justify-between gap-2 px-1">
						<span class="marginalia text-[9px]">FIG. 01 &middot; ENGAGEMENT, IN PROGRESS</span>
						<span class="marginalia text-[9px]">PLATE 1/1</span>
					</figcaption>
				</figure>
			</div>
		</div>

		<div class="mt-24 max-w-2xl space-y-3">
			<p class="section-eyebrow">SEC. 02 &middot; Why ThunderLite</p>
			<h2 class="text-3xl sm:text-4xl text-foreground">Rebuilt, not just revived.</h2>
			<div class="rule-dashed"></div>
		</div>

		<div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
			{#each features as f, i (f.title)}
				<div class="dossier p-5 transition-colors hover:bg-surface">
					<div class="flex items-center justify-between gap-3">
						<span
							class="inline-flex h-9 w-9 items-center justify-center border border-border-strong bg-accent text-accent-foreground"
						>
							<Icon icon={f.icon} width={18} />
						</span>
						<span class="marginalia text-[10px]">{String(i + 1).padStart(2, '0')}</span>
					</div>
					<h3 class="mt-4 text-lg text-foreground">{f.title}</h3>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
				</div>
			{/each}
		</div>
	</div>
</section>
