<script lang="ts">
	import Logo from '$lib/Components/Branding/Logo.svelte'
	import Icon from '@iconify/svelte'

	// Kept for back-compat with existing call sites. No longer used visually.
	export let icon: keyof typeof iconMap = 'welcome'
	const iconMap = {
		calendar: '',
		events: '',
		girlParty: '',
		halloween: '',
		heart: '',
		hospital: '',
		toronto: '',
		welcome: '',
	}
	icon

	const highlights = [
		{ icon: 'lucide:swords', label: 'Turn-based tactical combat' },
		{ icon: 'lucide:users', label: 'Async multiplayer with friends' },
		{ icon: 'lucide:hammer', label: 'Design and share custom maps' },
	]
</script>

<div class="min-h-screen flex">
	<aside
		class="hidden md:flex md:w-[42%] lg:w-[44%] relative overflow-hidden bg-primary text-primary-foreground"
	>
		<div
			class="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_10%,white_0,transparent_45%),radial-gradient(circle_at_80%_90%,white_0,transparent_40%)]"
		></div>

		<div class="relative flex flex-col justify-between p-12 lg:p-16 w-full">
			<a href="/" class="inline-flex items-center" aria-label="ThunderLite home">
				<div class="brightness-0 invert">
					<Logo width={140} height={36} />
				</div>
			</a>

			<div class="space-y-8 max-w-md">
				<div class="space-y-4">
					<h2 class="text-3xl lg:text-4xl font-semibold tracking-tight leading-tight">
						Welcome, commander.
					</h2>
					<p class="text-base text-primary-foreground/80 leading-relaxed">
						Sign in to save your progress, queue up multiplayer sessions, and publish maps to the
						community.
					</p>
				</div>

				<ul class="space-y-3">
					{#each highlights as h (h.label)}
						<li class="flex items-center gap-3 text-sm text-primary-foreground/90">
							<span class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10">
								<Icon icon={h.icon} width={16} />
							</span>
							{h.label}
						</li>
					{/each}
				</ul>
			</div>

			<p class="text-xs text-primary-foreground/60">
				© {new Date().getFullYear()} ThunderLite
			</p>
		</div>
	</aside>

	<main class="flex-1 flex flex-col bg-background overflow-y-auto">
		<header class="md:hidden flex items-center justify-center py-6 border-b border-border">
			<a href="/" class="inline-flex items-center" aria-label="ThunderLite home">
				<Logo width={120} height={30} />
			</a>
		</header>
		<div class="flex-1 flex items-center justify-center px-6 py-10 md:py-16">
			<div class="w-full max-w-md">
				<slot></slot>
			</div>
		</div>
	</main>
</div>
