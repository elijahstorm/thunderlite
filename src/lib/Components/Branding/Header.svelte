<script lang="ts">
	import { page } from '$app/stores'
	import LoginLogoutButton from '$lib/Components/Auth/LoginLogoutButton.svelte'
	import Logo from './Logo.svelte'

	export let logoLink: string = '/'
	export let toggleAside: VoidFunction | null = null

	const navLinks = [
		{ href: '/play', label: 'Play' },
		{ href: '/make', label: 'Browse Maps' },
		{ href: '/editor', label: 'Editor' },
		{ href: '/rooms', label: 'Rooms' },
		{ href: '/about', label: 'About' },
	]

	$: pathname = $page.url.pathname
</script>

<header
	class="sticky top-0 z-30 w-full border-b border-border surface-blur md:relative md:bg-background/0 md:backdrop-blur-none md:border-transparent"
>
	<div
		class="container flex items-center gap-4 py-3 md:py-4 md:border-b md:border-border md:bg-background/0"
	>
		{#if toggleAside}
			<button
				aria-controls="separator-sidebar"
				aria-label="Open sidebar"
				type="button"
				class="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-muted md:hidden"
				on:click={toggleAside}
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
			<Logo width={130} height={34} />
		</a>

		<nav class="hidden md:flex items-center gap-1 ml-6">
			{#each navLinks as link (link.href)}
				<a
					href={link.href}
					class="px-3 py-2 text-sm font-medium rounded-md transition-colors"
					class:text-foreground={pathname.startsWith(link.href)}
					class:bg-muted={pathname.startsWith(link.href)}
					class:text-muted-foreground={!pathname.startsWith(link.href)}
				>
					{link.label}
				</a>
			{/each}
		</nav>

		<div class="flex-1"></div>

		<LoginLogoutButton />
	</div>
</header>
