<script lang="ts">
	import { devPages } from '$lib/Dev/devPages'

	const tagStyles: Record<string, string> = {
		visuals: 'bg-sky-500/20 text-sky-300',
		combat: 'bg-red-500/20 text-red-300',
		ai: 'bg-violet-500/20 text-violet-300',
		economy: 'bg-emerald-500/20 text-emerald-300',
		rules: 'bg-amber-500/20 text-amber-300',
		movement: 'bg-teal-500/20 text-teal-300',
		stealth: 'bg-violet-500/20 text-violet-300',
	}
</script>

<svelte:head>
	<title>ThunderLite — Dev</title>
</svelte:head>

<main class="min-h-screen bg-slate-900 p-6 text-slate-100">
	<header class="mx-auto max-w-5xl space-y-1">
		<h1 class="text-2xl font-bold">Dev Playgrounds</h1>
		<p class="text-sm text-slate-400">
			Isolated test environments for each game system, wired to the real engine code. Dev server
			only — every page 404s in production.
		</p>
	</header>

	<div class="mx-auto mt-8 grid max-w-5xl grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
		{#each devPages as page}
			{#if page.ready}
				<a
					href={page.href}
					class="group flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800 p-4 transition-colors hover:border-slate-500 hover:bg-slate-700/70"
				>
					<div class="flex items-center justify-between gap-2">
						<h2 class="font-semibold group-hover:text-white">{page.title}</h2>
						<span class="rounded px-2 py-0.5 text-[10px] uppercase tracking-wide {tagStyles[page.tag]}">
							{page.tag}
						</span>
					</div>
					<p class="text-sm leading-snug text-slate-400">{page.blurb}</p>
				</a>
			{:else}
				<div
					class="flex cursor-not-allowed flex-col gap-2 rounded-lg border border-dashed border-slate-800 bg-slate-800/40 p-4 opacity-60"
				>
					<div class="flex items-center justify-between gap-2">
						<h2 class="font-semibold text-slate-300">{page.title}</h2>
						<span class="rounded bg-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
							soon
						</span>
					</div>
					<p class="text-sm leading-snug text-slate-500">{page.blurb}</p>
				</div>
			{/if}
		{/each}
	</div>
</main>
