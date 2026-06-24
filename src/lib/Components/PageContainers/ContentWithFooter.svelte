<script lang="ts">
	import Logo from '$lib/Components/Branding/Logo.svelte'

	export let noFooterOnMobile = false

	const socialLinks = [
		{
			href: 'https://github.com/elijahstorm',
			label: 'GitHub',
			icon: 'lucide:github',
		},
	]

	const navGroups = [
		{
			title: 'Game',
			links: [
				{ href: '/campaign', label: 'Play' },
				{ href: '/rooms', label: 'Rooms' },
				{ href: '/make', label: 'Browse Maps' },
				{ href: '/editor', label: 'Editor' },
				{ href: '/about', label: 'About' },
			],
		},
		{
			title: 'Company',
			links: [{ href: '/about', text: 'About' }],
		},
		{
			title: 'Legal',
			links: [
				{ href: '/privacy', text: 'Privacy Policy' },
				{ href: 'http://elijahstorm.github.io/', text: 'More by Elijah' },
			],
		},
	]

	const year = new Date().getFullYear()
</script>

<div class="min-h-screen flex flex-col bg-background">
	<div class="flex-1">
		<slot></slot>
	</div>

	<footer
		class:hidden={noFooterOnMobile}
		class:md:block={noFooterOnMobile}
		class="border-t border-border bg-surface-2 mt-16"
	>
		<div class="container py-12">
			<div class="grid gap-10 md:grid-cols-12">
				<div class="md:col-span-4 space-y-5">
					<a href="/" class="inline-flex items-center" aria-label="ThunderLite home">
						<Logo width={130} height={32} />
					</a>
					<p class="text-sm text-muted-foreground max-w-xs leading-relaxed">
						A browser-based recreation of Battalion: Arena, with turn-based tactics in the Advance
						Wars tradition.
					</p>
					<div class="flex items-center gap-3 pt-1">
						{#each socialLinks as link (link.href)}
							<a
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
								aria-label={link.label}
							>
								<img class="w-4 h-4 dark:invert" src="/images/icons/github-mark-white.svg" alt="" />
							</a>
						{/each}
					</div>
				</div>

				<div class="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
					{#each navGroups as group (group.title)}
						<div>
							<h3 class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
								{group.title}
							</h3>
							<ul class="mt-4 space-y-2.5">
								{#each group.links as link (link.href)}
									<li>
										<a
											href={link.href}
											class="text-sm text-foreground/80 hover:text-foreground transition-colors"
										>
											{link.text}
										</a>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			</div>

			<div
				class="mt-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6 border-t border-border"
			>
				<p class="text-xs text-muted-foreground">© {year} ThunderLite. All rights reserved.</p>
				<p class="text-xs text-muted-foreground">
					Built by <a href="http://elijahstorm.github.io/" class="link">Elijah Storm</a>.
				</p>
			</div>
		</div>
	</footer>
</div>
