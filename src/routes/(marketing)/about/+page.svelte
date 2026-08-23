<script lang="ts">
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import Icon from '@iconify/svelte'

	const pillars = [
		{
			icon: 'lucide:swords',
			title: 'Tactics over twitch',
			body: 'Every move is deliberate. Terrain, vision, and unit synergy are the puzzle; reflexes never enter the picture.',
		},
		{
			icon: 'lucide:globe-2',
			title: 'Browser-native',
			body: 'No download, no installer, no platform lock-in. Open a tab and you are in the field.',
		},
		{
			icon: 'lucide:users-round',
			title: 'Play together, anytime',
			body: 'Share a session code. Your friend takes their turn whenever they get the chance: async, but live when you want it.',
		},
		{
			icon: 'lucide:hammer',
			title: 'A community of cartographers',
			body: 'The map editor is core, not a side feature. Every player can author and publish.',
		},
	]
</script>

<Casing>
	<a
		href="https://www.dontcode.co"
		target="_blank"
		rel="noopener noreferrer"
		class="group mt-4 flex items-center gap-4 rounded-2xl border border-border bg-accent/40 p-4 sm:p-5 transition-colors hover:bg-accent/60 hover:border-border-strong"
	>
		<img
			src="/images/logo/dontcode-mascot.svg"
			alt="DontCode mascot"
			class="h-14 w-14 sm:h-16 sm:w-16 shrink-0"
		/>
		<div class="min-w-0 flex-1">
			<p class="font-semibold text-foreground">Made with DontCode</p>
			<p class="text-sm text-muted-foreground leading-relaxed">
				This free service is supported and sponsored in full by DontCode.
			</p>
		</div>
		<span
			class="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-primary shrink-0"
		>
			Visit DontCode
			<Icon
				icon="lucide:arrow-right"
				width={16}
				class="transition-transform group-hover:translate-x-0.5"
			/>
		</span>
	</a>

	<section class="max-w-3xl mx-auto py-8 space-y-6">
		<p class="section-eyebrow">About ThunderLite</p>
		<h1 class="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground leading-tight">
			A love letter to <span class="text-primary">Battalion: Arena</span>.
		</h1>
		<p class="text-lg text-muted-foreground leading-relaxed">
			ThunderLite is a browser-based recreation of Urban Squall's Battalion: Arena, a turn-based
			tactics game in the Advance Wars family. It's free, open, and built for the players who never
			stopped loving the genre.
		</p>
	</section>

	<section class="max-w-4xl mx-auto pt-8 pb-12">
		<div class="grid sm:grid-cols-2 gap-4">
			{#each pillars as p (p.title)}
				<div class="card p-6">
					<div
						class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"
					>
						<Icon icon={p.icon} width={20} />
					</div>
					<h3 class="mt-4 font-semibold text-foreground">{p.title}</h3>
					<p class="mt-2 text-sm text-muted-foreground leading-relaxed">{p.body}</p>
				</div>
			{/each}
		</div>
	</section>

	<section class="max-w-3xl mx-auto py-8 space-y-5 text-muted-foreground leading-relaxed">
		<h2 class="text-2xl font-semibold tracking-tight text-foreground">Why ThunderLite exists</h2>
		<p>
			Browser flash games shaped a generation of strategy fans, and Battalion: Arena was one of the
			best of them. When Flash sunset, that whole library went dark. ThunderLite is one small
			attempt to bring that genre forward, with the same patient, thoughtful pacing, in a modern
			stack that just runs.
		</p>
		<p>
			I rebuilt it rather than just porting it, because a few things always bugged me about the
			original. The biggest was the AI: the CPU ran a fixed pattern, so after a handful of games you
			were not fighting an opponent anymore, just executing a routine against one. ThunderLite's CPU
			reads the battlefield and reacts to what it actually observes you doing over the course of a
			match, so it takes much longer to feel solved.
		</p>
		<p>
			Map size was the second wall. The original engine struggled past roughly 20×20 tiles.
			ThunderLite comfortably runs 100×100 battles and has been pushed to 500×500 fully populated
			with units and buildings. Big maps change how the game plays: real fronts, real flanks, real
			logistics.
		</p>
		<p>
			And multiplayer needed to stop breaking. Matches now run on DontCode's hosted database and
			realtime infrastructure, so a game you start actually finishes: live sessions stay in sync,
			and async games keep waiting until both players come back. DontCode's support is also a big
			part of why all of this can stay free to play.
		</p>
		<p>
			It is built and maintained by one person, in the open. It is free to play, with no ads, no
			paywalled content, and no tracking beyond the basics required to keep the lights on. If you
			want to chip in for hosting, there is an optional donation page, Patreon style, and nothing in
			the game is ever locked behind it. If something breaks or you have an idea, tell me on GitHub.
			I read everything.
		</p>
		<div class="pt-2 flex flex-wrap items-center gap-3">
			<a href="/login" class="btn btn-primary">
				<Icon icon="lucide:play" width={16} />
				Jump into a game
			</a>
			<a href="/editor" class="btn btn-outline">
				<Icon icon="lucide:hammer" width={16} />
				Build a map
			</a>
			<a href="/make" class="btn btn-outline">Browse community maps</a>
			<a
				href="https://github.com/elijahstorm/thunderlite/issues"
				target="_blank"
				rel="noopener noreferrer"
				class="btn btn-outline"
			>
				<Icon icon="lucide:bug" width={16} />
				Report a bug
			</a>
		</div>
	</section>

	<section class="max-w-3xl mx-auto py-8">
		<div class="card p-6 sm:p-8 space-y-5">
			<div class="flex items-center gap-4">
				<img
					src="/images/logo/dontcode-mascot.svg"
					alt="DontCode mascot"
					class="h-16 w-16 shrink-0"
				/>
				<div>
					<p class="section-eyebrow">Powered by</p>
					<h2 class="text-2xl font-semibold tracking-tight text-foreground">DontCode</h2>
				</div>
			</div>
			<div class="space-y-4 text-muted-foreground leading-relaxed">
				<p>
					ThunderLite is supported and sponsored in full by
					<a href="https://www.dontcode.co" target="_blank" rel="noopener noreferrer" class="link"
						>DontCode</a
					>. It runs the accounts, database, and realtime multiplayer that keep the game online, so
					ThunderLite can stay free to play with no ads.
				</p>
				<p>
					DontCode is a platform for building and shipping full-stack apps fast. If you are curious
					about how ThunderLite is put together, or want to build something of your own, it is a
					great place to start.
				</p>
			</div>
			<div class="pt-1">
				<a
					href="https://www.dontcode.co"
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-primary"
				>
					Visit DontCode
					<Icon icon="lucide:arrow-up-right" width={16} />
				</a>
			</div>
		</div>
	</section>
</Casing>
