<script lang="ts">
	import Icon from '@iconify/svelte'

	const perks = [
		{ icon: 'lucide:package', label: 'Persistent inventory across sessions' },
		{ icon: 'lucide:map', label: 'Unlimited custom maps' },
		{ icon: 'lucide:zap', label: 'Priority match-making' },
		{ icon: 'lucide:heart', label: 'Support indie development' },
	]
</script>

<section>
	<header class="mb-6">
		<p class="section-eyebrow">Upgrade</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">ThunderLite Pro</h1>
		<p class="text-sm text-muted-foreground mt-1">
			Get more out of the game and help keep the project alive.
		</p>
	</header>

	<div class="card p-6 sm:p-8 space-y-6">
		<ul class="grid sm:grid-cols-2 gap-3">
			{#each perks as perk (perk.label)}
				<li class="flex items-start gap-3 text-sm text-foreground">
					<span
						class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground shrink-0"
					>
						<Icon icon={perk.icon} width={16} />
					</span>
					{perk.label}
				</li>
			{/each}
		</ul>

		<div class="border-t border-border pt-6 flex flex-wrap items-end justify-between gap-3">
			<div>
				<p class="text-xs uppercase tracking-wide text-muted-foreground">Coming soon</p>
				<p class="text-2xl font-semibold tracking-tight text-foreground mt-1">
					ThunderLite Pro is in the works
				</p>
			</div>
			<button class="btn btn-primary" disabled>Notify me</button>
		</div>
	</div>
</section>
