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
			<Icon icon="lucide:hammer" width={12} />
			Coming soon
		</span>
	</header>

	<div class="card p-10 text-center space-y-4">
		<div
			class="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground"
		>
			<Icon icon="lucide:package" width={22} />
		</div>
		<div class="space-y-1">
			<p class="font-medium text-foreground">Items are still being built</p>
			<p class="text-sm text-muted-foreground">
				Collectibles and cosmetics will show up here in a future update. Like everything else in
				ThunderLite, they will be free.
			</p>
		</div>
	</div>
</section>
