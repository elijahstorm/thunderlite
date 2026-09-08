<script lang="ts">
	import FieldGround from '$lib/Components/Branding/FieldGround.svelte'
	import Logo from '$lib/Components/Branding/Logo.svelte'
	import PoweredByDontCode from '$lib/Components/Branding/PoweredByDontCode.svelte'
	import Icon from '@iconify/svelte'

	interface Props {
		// Kept for back-compat with existing call sites. No longer used visually.
		icon?: keyof typeof iconMap
		children?: import('svelte').Snippet
	}

	let { icon = 'welcome', children }: Props = $props()
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

	const highlights = [
		{ icon: 'lucide:swords', label: 'Turn-based tactical combat' },
		{ icon: 'lucide:users', label: 'Live multiplayer with friends' },
		{ icon: 'lucide:hammer', label: 'Design and share custom maps' },
	]
</script>

<div class="min-h-screen flex">
	<!-- The enlistment panel: drab stock, survey grid, and the wordmark set in
		 reverse. Rather than inverting the logo (which would flatten the amber
		 off the mark) the panel re-points the brand tokens for its own subtree. -->
	<aside
		class="hidden md:flex md:w-[42%] lg:w-[44%] relative overflow-hidden bg-primary text-primary-foreground"
	>
		<FieldGround tone="reverse" />

		<div class="relative flex flex-col justify-between p-12 lg:p-16 w-full">
			<a
				href="/"
				class="inline-flex items-center self-start"
				aria-label="ThunderLite home"
				style="--logo-icon-filter: brightness(0) invert(1); --foreground: var(--primary-foreground); --muted-foreground: color-mix(in srgb, var(--primary-foreground) 65%, transparent); --border-strong: color-mix(in srgb, var(--primary-foreground) 45%, transparent);"
			>
				<Logo height={34} />
			</a>

			<div class="space-y-7 max-w-md">
				<h2 class="text-4xl lg:text-5xl leading-tight">Welcome, commander.</h2>

				<ul class="space-y-3">
					{#each highlights as h (h.label)}
						<li class="flex items-center gap-3 text-sm text-primary-foreground/90">
							<Icon icon={h.icon} width={17} class="shrink-0 text-primary-foreground/60" />
							{h.label}
						</li>
					{/each}
				</ul>
			</div>

			<div class="space-y-1">
				<p class="text-xs text-primary-foreground/60">
					© {new Date().getFullYear()} ThunderLite
				</p>
				<p class="text-xs text-primary-foreground/60">
					Made with
					<a
						href="https://www.dontcode.co"
						target="_blank"
						rel="noopener noreferrer"
						class="underline underline-offset-2 hover:text-primary-foreground"
					>
						DontCode
					</a>
				</p>
			</div>
		</div>
	</aside>

	<main class="relative flex-1 flex flex-col field-backdrop overflow-y-auto">
		<FieldGround />
		<header class="relative md:hidden flex items-center justify-center py-6 border-b border-border">
			<a href="/" class="inline-flex items-center" aria-label="ThunderLite home">
				<Logo height={30} />
			</a>
		</header>
		<div class="relative flex-1 flex items-center justify-center px-6 py-10 md:py-16">
			<div class="w-full max-w-md">
				{@render children?.()}
			</div>
		</div>
	</main>
</div>
