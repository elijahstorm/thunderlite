<script lang="ts">
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import Icon from '@iconify/svelte'
</script>

<Casing>
	<section class="max-w-2xl mx-auto py-12 text-center space-y-6">
		<div
			class="inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground mx-auto"
		>
			<Icon icon="lucide:download" width={24} />
		</div>
		<div class="space-y-3">
			<p class="section-eyebrow">Native apps</p>
			<h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
				No download required.
			</h1>
			<p class="text-muted-foreground leading-relaxed">
				ThunderLite runs entirely in your browser — no app to install, no platform to wait on. If
				native builds ever ship, they'll show up here first.
			</p>
		</div>
		<div class="flex items-center justify-center gap-3 pt-2">
			<a href="/play" class="btn btn-primary">
				<Icon icon="lucide:play" width={16} />
				Play in browser
			</a>
		</div>
	</section>
</Casing>
