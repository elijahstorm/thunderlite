<script lang="ts">
	import Icon from '@iconify/svelte'
</script>

<section>
	<header class="mb-6 flex items-center justify-between gap-4">
		<div>
			<p class="section-eyebrow">Inventory</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">My Items</h1>
		</div>
		<span class="chip text-secondary border-secondary/30 bg-secondary/10">
			<Icon icon="lucide:sparkles" width={12} />
			Pro feature
		</span>
	</header>

	<div class="card p-10 text-center space-y-4">
		<div
			class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground"
		>
			<Icon icon="lucide:package" width={22} />
		</div>
		<div class="space-y-1">
			<p class="font-medium text-foreground">Unlock items with Pro</p>
			<p class="text-sm text-muted-foreground">
				Pro players keep their inventory across sessions and devices.
			</p>
		</div>
		<a href="/my/pro" class="btn btn-primary">Upgrade to Pro</a>
	</div>
</section>
