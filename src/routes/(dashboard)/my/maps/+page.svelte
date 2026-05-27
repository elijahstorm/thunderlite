<script lang="ts">
	import Icon from '@iconify/svelte'
</script>

<section>
	<header class="mb-6 flex flex-wrap items-start justify-between gap-3">
		<div>
			<p class="section-eyebrow">Library</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-foreground">My Maps</h1>
			<p class="text-sm text-muted-foreground mt-1">Maps you've created and saved.</p>
		</div>
		<a href="/editor" class="btn btn-primary">
			<Icon icon="lucide:hammer" width={14} />
			Create a map
		</a>
	</header>

	<div class="card p-10 text-center space-y-4">
		<p class="text-sm text-muted-foreground">Nothing here yet.</p>
		<a href="/editor" class="btn btn-outline btn-sm">
			<Icon icon="lucide:hammer" width={14} />
			Open the map editor
		</a>
	</div>
</section>
