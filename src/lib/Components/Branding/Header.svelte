<script lang="ts">
	import { page } from '$app/stores'
	import LoginLogoutButton from '$lib/Components/Auth/LoginLogoutButton.svelte'
	import Logo from './Logo.svelte'

	interface Props {
		logoLink?: string
		toggleAside?: VoidFunction | null
	}

	let { logoLink = '/', toggleAside = null }: Props = $props()

	const navLinks = [
		{ href: '/campaign', label: 'Play' },
		// Games before Rooms on purpose: the games you already have running is
		// the thing a returning player wants, and matchmaking is what you do once.
		{ href: '/games', label: 'Games', badge: true },
		{ href: '/rooms', label: 'Rooms' },
		{ href: '/make', label: 'Maps' },
		{ href: '/editor', label: 'Editor' },
		{ href: '/about', label: 'About' },
	]

	let pathname = $derived($page.url.pathname)
	// Async games waiting on this player's move, counted by the in-app layout
	// loads. Absent on marketing pages, which is why it falls back to zero.
	let awaitingTurns = $derived(($page.data.awaitingTurns as number | undefined) ?? 0)

	// Section numbers, printed in the margin the way a manual indexes its tabs.
	const sectionNo = (i: number) => String(i + 1).padStart(2, '0')
</script>

<!-- Classification rail. Sets the document frame before any nav appears: this
	 is a field manual, and the header is its cover strip. -->
<div class="hidden md:block border-b border-border bg-surface-2">
	<div class="container flex items-center gap-4 py-1.5">
		<span class="marginalia">THUNDERLITE // FIELD MANUAL</span>
		<span class="hidden lg:block flex-1 rule-dashed"></span>
		{#if awaitingTurns}
			<a href="/games" class="stamp stamp-alert stamp-tilt">
				<span class="h-1.5 w-1.5 bg-current"></span>
				{awaitingTurns} awaiting orders
			</a>
		{:else}
			<span class="marginalia">ISSUE 01 &middot; TURN-BASED TACTICS</span>
		{/if}
	</div>
</div>

<header class="sticky top-0 z-30 w-full border-b border-border-strong surface-blur">
	<div class="container flex items-center gap-4 py-2.5 md:py-3">
		{#if toggleAside}
			<button
				aria-controls="separator-sidebar"
				aria-label="Open sidebar"
				type="button"
				class="inline-flex items-center justify-center h-9 w-9 rounded-sm border border-border text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
				onclick={toggleAside}
			>
				<svg
					class="h-5 w-5"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
		{/if}

		<a href={logoLink} class="flex items-center" aria-label="ThunderLite home">
			<Logo height={30} strapline={null} />
		</a>

		<nav class="hidden md:flex items-stretch self-stretch ml-8">
			{#each navLinks as link, i (link.href)}
				{@const active = pathname.startsWith(link.href)}
				<a
					href={link.href}
					aria-current={active ? 'page' : undefined}
					class="group relative flex items-center gap-2 px-3.5 py-2 transition-colors"
					class:text-foreground={active}
					class:text-muted-foreground={!active}
				>
					<!-- Tab number in the margin, dropped once the tab is the one you
						 are reading so the label carries the emphasis alone. -->
					<span
						class="marginalia text-[9px] transition-opacity"
						class:opacity-0={active}
						class:opacity-60={!active}
					>
						{sectionNo(i)}
					</span>
					<span class="text-[13px] uppercase tracking-[0.1em] font-display font-semibold">
						{link.label}
					</span>
					{#if link.badge && awaitingTurns}
						<span
							class="min-w-4 border border-secondary bg-secondary px-1 text-[10px] font-semibold leading-4 text-secondary-foreground font-stamp text-center"
							aria-label="{awaitingTurns} games waiting on your move"
						>
							{awaitingTurns}
						</span>
					{/if}
					<!-- Amber marker under the live section, the highlighter run across
						 a page of the manual. -->
					<span
						class="pointer-events-none absolute inset-x-2 -bottom-px h-[2px] origin-left bg-secondary transition-transform duration-150"
						class:scale-x-100={active}
						class:scale-x-0={!active}
						class:group-hover:scale-x-100={!active}
						class:group-hover:bg-border-strong={!active}
					></span>
				</a>
			{/each}
		</nav>

		<div class="flex-1"></div>

		<LoginLogoutButton />
	</div>
</header>
