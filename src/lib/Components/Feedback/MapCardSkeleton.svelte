<script lang="ts">
	// Placeholder that mirrors MapCard's layout so the /make listing reserves the
	// right shape while the streamed map data flushes in. Purely decorative.
</script>

<article class="card overflow-hidden" aria-hidden="true">
	<div class="md:flex animate-pulse">
		<div class="md:w-56 md:shrink-0 bg-surface-2 aspect-video md:aspect-auto"></div>

		<div class="flex-1 p-5 sm:p-6 flex flex-col gap-4">
			<div class="flex items-start justify-between gap-3">
				<div class="flex items-center gap-2">
					<div class="h-8 w-8 rounded-full bg-surface-2"></div>
					<div class="h-3 w-24 rounded bg-surface-2"></div>
				</div>
				<div class="h-8 w-8 rounded-md bg-surface-2"></div>
			</div>

			<div class="space-y-2">
				<div class="h-4 w-2/3 rounded bg-surface-2"></div>
				<div class="h-3 w-full rounded bg-surface-2"></div>
			</div>

			<div class="flex flex-wrap items-center gap-1.5">
				<div class="h-5 w-16 rounded-full bg-surface-2"></div>
				<div class="h-5 w-12 rounded-full bg-surface-2"></div>
			</div>

			<div class="flex items-center justify-between gap-3 pt-2 mt-auto border-t border-border">
				<div class="flex items-center gap-4 pt-3">
					<div class="h-3 w-8 rounded bg-surface-2"></div>
					<div class="h-3 w-8 rounded bg-surface-2"></div>
					<div class="h-3 w-8 rounded bg-surface-2"></div>
				</div>
				<div class="h-3 w-16 rounded bg-surface-2 mt-3"></div>
			</div>
		</div>
	</div>
</article>
