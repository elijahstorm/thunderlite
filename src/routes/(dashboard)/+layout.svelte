<script lang="ts">
	import { onNavigate } from '$app/navigation'
	import { page } from '$app/stores'
	import Casing from '$lib/Components/PageContainers/Casing.svelte'
	import ContentWithFooter from '$lib/Components/PageContainers/ContentWithFooter.svelte'
	import Icon from '@iconify/svelte'

	let openAside = false

	const escape = (e: KeyboardEvent) => e.key === 'Escape' && closeAside()
	const toggleAside = () => (openAside = !openAside)
	const closeAside = () => (openAside = false)

	// @ts-ignore
	onNavigate(closeAside)

	const navSections = [
		{
			title: 'Account',
			items: [
				{ href: '/me', label: 'Profile', icon: 'lucide:user' },
				{
					href: '/my/items',
					label: 'My Items',
					icon: 'lucide:layout-grid',
					badge: 'Pro',
				},
				{ href: '/my/maps', label: 'My Maps', icon: 'lucide:map' },
				{ href: '/my/inbox', label: 'Inbox', icon: 'lucide:inbox' },
				{ href: '/my/friends', label: 'Friends', icon: 'lucide:users' },
			],
		},
		{
			title: 'More',
			items: [
				{ href: '/my/pro', label: 'Upgrade to Pro', icon: 'lucide:sparkles' },
				{ href: '/support', label: 'Help & Support', icon: 'lucide:life-buoy' },
			],
		},
	]

	$: pathname = $page.url.pathname
</script>

<svelte:window on:keydown={escape} />

<ContentWithFooter>
	<Casing {toggleAside}>
		<div
			class="fixed inset-0 z-30 bg-foreground/30 backdrop-blur-sm md:hidden"
			class:hidden={!openAside}
			on:keydown={closeAside}
			on:click={closeAside}
			aria-label="Close navigation side bar"
			role="button"
			tabindex="0"
		></div>

		<div class="flex gap-8">
			<aside
				class="fixed top-0 left-0 z-40 w-72 h-screen transition-transform -translate-x-full md:relative md:translate-x-0 md:w-60 md:h-auto md:z-0"
				class:translate-x-0={openAside}
				aria-label="Sidebar"
			>
				<div
					class="h-full md:h-auto md:sticky md:top-24 bg-surface md:bg-transparent border-r border-border md:border-r-0 p-4 md:p-0 overflow-y-auto"
				>
					{#each navSections as section, sectionIdx (section.title)}
						<div class:mt-8={sectionIdx > 0}>
							<p
								class="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
							>
								{section.title}
							</p>
							<ul class="space-y-0.5">
								{#each section.items as item (item.href)}
									<li>
										<a
											href={item.href}
											class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors group"
											class:bg-accent={pathname === item.href}
											class:text-accent-foreground={pathname === item.href}
											class:text-muted-foreground={pathname !== item.href}
											class:hover:bg-muted={pathname !== item.href}
											class:hover:text-foreground={pathname !== item.href}
										>
											<Icon icon={item.icon} width={16} />
											<span class="flex-1">{item.label}</span>
											{#if item.badge}
												<span
													class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary/10 text-secondary"
												>
													{item.badge}
												</span>
											{/if}
										</a>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			</aside>

			<div class="flex-1 min-w-0">
				<div class="space-y-6">
					<slot></slot>
				</div>
			</div>
		</div>
	</Casing>
</ContentWithFooter>
