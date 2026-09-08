<script lang="ts">
	import FieldGround from '$lib/Components/Branding/FieldGround.svelte'
	import Logo from '$lib/Components/Branding/Logo.svelte'
	import PoweredByDontCode from '$lib/Components/Branding/PoweredByDontCode.svelte'

	interface Props {
		noFooterOnMobile?: boolean
		children?: import('svelte').Snippet
	}

	let { noFooterOnMobile = false, children }: Props = $props()

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
			title: 'Project',
			links: [
				{ href: '/about', label: 'About' },
				{ href: '/battalion-arena', label: 'Battalion: Arena' },
				{ href: 'https://github.com/elijahstorm/thunderlite/issues', label: 'Report a bug' },
				{ href: 'https://github.com/elijahstorm/thunderlite', label: 'Source on GitHub' },
			],
		},
		{
			title: 'Legal',
			links: [
				{ href: '/privacy', label: 'Privacy Policy' },
				{ href: 'http://elijahstorm.github.io/', label: 'More by Elijah' },
			],
		},
	]

	const year = new Date().getFullYear()
</script>

<!-- Every page sits on the same printed stock: warm ground, contour survey,
	 paper tooth. -->
<div class="relative min-h-screen flex flex-col field-backdrop">
	<div class="pointer-events-none fixed inset-0 z-0"><FieldGround /></div>

	<div class="relative z-10 flex-1 flex flex-col">
		<div class="flex-1">
			{@render children?.()}
		</div>

		<footer
			class:hidden={noFooterOnMobile}
			class:md:block={noFooterOnMobile}
			class="relative mt-10 border-t-2 border-border-strong bg-surface-2"
		>
			<div class="container py-12">
				<div class="grid gap-10 md:grid-cols-12">
					<div class="md:col-span-4 space-y-5">
						<a href="/" class="inline-flex items-center" aria-label="ThunderLite home">
							<Logo height={34} />
						</a>
						<p class="text-sm text-muted-foreground max-w-xs leading-relaxed">
							A free browser rebuild of Battalion: Arena.
						</p>
						<div class="flex items-center gap-3 pt-1">
							{#each socialLinks as link (link.href)}
								<a
									href={link.href}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border-strong text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
									aria-label={link.label}
								>
									<img class="w-4 h-4 dark:invert" src="/images/icons/github-mark.svg" alt="" />
								</a>
							{/each}
						</div>
					</div>

					<div class="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-8">
						{#each navGroups as group (group.title)}
							<div>
								<h3 class="text-sm font-semibold text-foreground">{group.title}</h3>
								<ul class="mt-4 space-y-2.5">
									{#each group.links as link (link.href)}
										<li>
											<a
												href={link.href}
												class="text-sm text-foreground/75 hover:text-foreground transition-colors"
											>
												{link.label}
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
					<p class="text-xs text-muted-foreground">
						© {year} ThunderLite. Built by
						<a href="http://elijahstorm.github.io/" class="link">Elijah Storm</a>.
					</p>
					<PoweredByDontCode variant="footer" />
				</div>
			</div>
		</footer>
	</div>
</div>
