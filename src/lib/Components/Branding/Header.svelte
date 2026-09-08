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
</script>

<header class="sticky top-0 z-30 w-full border-b border-border-strong bg-background">
	<div class="container flex items-center gap-4 py-2.5 md:py-3">
		{#if toggleAside}
			<button
				aria-controls="separator-sidebar"
				aria-label="Open sidebar"
				type="button"
				class="inline-flex items-center justify-center h-9 w-9 rounded-sm border border-border text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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

		<a
			href={logoLink}
			class="flex items-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label="ThunderLite home"
		>
			<Logo height={30} />
		</a>

		<nav class="hidden md:flex items-stretch self-stretch ml-8">
			{#each navLinks as link (link.href)}
				{@const active = pathname.startsWith(link.href)}
				<a
					href={link.href}
					aria-current={active ? 'page' : undefined}
					class="group relative flex items-center gap-2 px-3.5 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					class:text-foreground={active}
					class:text-muted-foreground={!active}
				>
					<span class="font-display text-[13px] font-semibold uppercase tracking-[0.08em]">
						{link.label}
					</span>
					{#if link.badge && awaitingTurns}
						<span
							class="numeric min-w-4 bg-secondary px-1 text-[11px] font-semibold leading-4 text-secondary-foreground text-center"
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
