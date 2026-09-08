<script lang="ts">
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import FaqSection from '$lib/Components/Seo/FaqSection.svelte'
	import { BATTALION_FAQ } from '$lib/Seo/faq'
	import Icon from '@iconify/svelte'

	// Side-by-side rather than prose, because "can I still play it" is answered
	// fastest by a table, and a table is also the shape an answer engine lifts
	// cleanly into a comparison.
	const comparison = [
		{ field: 'Status', old: 'Servers off since April 2012', now: 'Live, hosted, free' },
		{ field: 'Runs on', old: 'Adobe Flash (dead since 2020)', now: 'Any modern browser' },
		{ field: 'Map size', old: 'Roughly 20x20 tiles', now: 'Up to 500x500 tiles' },
		{ field: 'CPU', old: 'Fixed script, learnable', now: 'Scores the position, reacts to you' },
		{ field: 'Multiplayer', old: 'Unreliable, then gone', now: 'Live rooms and async by email' },
		{ field: 'Custom maps', old: 'None', now: 'Full editor with scripted events' },
		{ field: 'Cost', old: 'Free', now: 'Free, no ads, no paywall' },
	]
</script>

<Casing>
	<article class="mx-auto max-w-3xl py-8 space-y-6">
		<p class="section-eyebrow">SEC. 01 · Archive recovery</p>
		<h1 class="text-4xl sm:text-5xl uppercase tracking-tight text-foreground leading-tight">
			Battalion: Arena is gone.
			<span class="block text-secondary">ThunderLite is the rebuild.</span>
		</h1>
		<p class="text-lg text-foreground/85 leading-relaxed">
			Battalion: Arena was a turn-based tactics game by Urban Squall, played mostly on Kongregate
			and loved by people who wanted Advance Wars in a browser tab. Its servers were switched off on
			April 1st, 2012, and the Flash plugin it ran on reached end of life in December 2020. There is
			no way to play the original today, on any browser, at any price.
		</p>
		<p class="text-lg text-foreground/85 leading-relaxed">
			ThunderLite is a free, from-scratch rebuild of that game. It runs in a normal browser tab with
			no download and no plugin, the single player campaign needs no account, and multiplayer works
			both live and over days.
		</p>
		<div class="flex flex-wrap items-center gap-3 pt-2">
			<a class="btn btn-primary btn-lg" href="/campaign">
				<Icon icon="lucide:flag" width={18} />
				Play the campaign now
			</a>
			<a class="btn btn-outline btn-lg" href="/">Read what is different</a>
		</div>
	</article>

	<section class="mx-auto max-w-3xl py-8">
		<h2 class="text-2xl sm:text-3xl uppercase text-foreground">Battalion: Arena vs. ThunderLite</h2>
		<dl class="mt-6 border-t border-border">
			{#each comparison as row (row.field)}
				<div class="grid sm:grid-cols-3 gap-1 sm:gap-4 py-4 border-b border-border">
					<dt class="text-sm text-muted-foreground uppercase tracking-wide">{row.field}</dt>
					<dd class="text-sm text-foreground/60 line-through decoration-border-strong">
						{row.old}
					</dd>
					<dd class="text-sm text-foreground">{row.now}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section class="mx-auto max-w-3xl py-8 space-y-5 text-muted-foreground leading-relaxed">
		<h2 class="text-2xl sm:text-3xl uppercase text-foreground">
			Why a rebuild instead of an emulator
		</h2>
		<p>
			Flash games can sometimes be preserved by running the original file through an emulator, but
			Battalion: Arena cannot. It was a server-backed game: matchmaking, accounts, and match state
			all lived on infrastructure that no longer exists. Preserve the client perfectly and you still
			get a login screen talking to nothing.
		</p>
		<p>
			So ThunderLite reimplements the game rather than the file. What is kept is the part worth
			keeping: a grid you move across a tile at a time, buildings you capture to fund the next wave,
			and unit matchups where sending the wrong thing loses the fight before either side rolls a
			die. Terrain and position decide battles. Nothing rewards a fast hand.
		</p>
		<p>
			What is new is everything the original engine could not carry. Maps go to 500x500 tiles
			instead of stalling past 20x20. Terrain has height, which decides sight lines and gives
			indirect fire real shadows to hide in. Weather rolls through mid-match and changes movement
			and cover. The CPU scores the position it can actually see through fog of war rather than
			replaying a script, and higher difficulties make it search further ahead instead of handing it
			free damage.
		</p>
		<p>
			Multiplayer runs on hosted infrastructure, so a game you start actually finishes. Play a live
			room with turn timers in one sitting, or trade turns over days and get an email when it is
			your move. Rated one-on-one matches settle an ELO rating, and every finished match can be
			replayed turn by turn.
		</p>
	</section>

	<section class="mx-auto max-w-3xl py-8 space-y-5 text-muted-foreground leading-relaxed">
		<h2 class="text-2xl sm:text-3xl uppercase text-foreground">
			If you came here from Advance Wars
		</h2>
		<p>
			ThunderLite is in the same family: turn-based grid tactics, funded properties, unit counters,
			fog of war. It is not a Nintendo game and does not try to be one. What it offers that a
			console entry cannot is that it runs in the tab you already have open, costs nothing, needs no
			account to start, and lets you build and publish your own maps for other players to fight
			over.
		</p>
		<div class="flex flex-wrap items-center gap-3 pt-1">
			<a class="btn btn-primary" href="/campaign">
				<Icon icon="lucide:play" width={16} />
				Start the campaign
			</a>
			<a class="btn btn-outline" href="/editor">
				<Icon icon="lucide:hammer" width={16} />
				Build a map
			</a>
			<a class="btn btn-outline" href="/about">About the project</a>
		</div>
	</section>

	<FaqSection
		items={BATTALION_FAQ}
		eyebrow="SEC. 05 · Field questions"
		heading="Battalion: Arena questions"
		contained={false}
	/>
</Casing>
