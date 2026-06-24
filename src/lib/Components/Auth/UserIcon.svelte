<script lang="ts">
	import { fly } from 'svelte/transition'
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'
	import FullProfileCard from '$lib/Components/Widgets/Social/FullProfileCard.svelte'
	import { browser } from '$app/environment'

	export let auth: string | null = null
	export let user: UserDBData | null = null
	export let size: number = 2
	export let noClick = false

	let floatingProfile: HTMLDivElement
	let shouldFlowLeft = false
	let shouldFlowUp = false
	let shouldFlowRight = false
	let reflow = 0
	let open = false
	let style: string
	$: style = `width: ${size}rem; height: ${size}rem;`

	const openProfile = () => (open = !noClick && !!user?.username && !open)

	const fetchUserData = (userAuth: string) =>
		fetch(`/api/user/${userAuth}`)
			.then((res) => res.json())
			.then((data) => {
				if (data.user) {
					user = data.user
				}
			})

	$: {
		if (browser && typeof auth === 'string') {
			fetchUserData(auth)
		}
	}

	$: {
		reflow
		open
		const profile = floatingProfile?.getBoundingClientRect()
		shouldFlowLeft = profile?.x + 120 > floatingProfile?.ownerDocument?.body?.clientWidth
		shouldFlowUp = profile?.y + 400 > floatingProfile?.ownerDocument?.body?.clientHeight
		shouldFlowRight = !shouldFlowLeft && profile?.x - 120 < 0
	}
</script>

<svelte:window on:resize={() => (reflow = performance.now())} />

<div class="relative">
	<button class="contents" disabled={noClick} on:click={openProfile}>
		<div
			bind:this={floatingProfile}
			class="rounded-full overflow-hidden bg-surface-2 ring-1 ring-border hover:ring-border-strong transition-shadow"
			class:cursor-pointer={!noClick}
			class:cursor-default={noClick}
			{style}
		>
			<FallbackImage src={user?.profile_image_url} alt="{user?.display_name ?? 'user'} profile" cover />
		</div>
	</button>

	<div
		class="fixed inset-0 h-screen w-screen z-50 bg-foreground/10 backdrop-blur-[2px]"
		class:hidden={!open}
		on:keydown|stopPropagation={() => (open = false)}
		on:click|stopPropagation={() => (open = false)}
		aria-label="Close profile popup modal"
		role="button"
		tabindex="0"
	></div>

	{#if open}
		<div
			class="absolute left-1/2 -translate-x-1/2 pt-2 z-50 max-w-56 w-56"
			class:bottom-12={shouldFlowUp}
			class:-translate-x-6={shouldFlowRight}
			class:-translate-x-40={shouldFlowLeft}
			in:fly={{ y: -10, duration: 180 }}
			out:fly={{ y: -10, duration: 180 }}
		>
			{#if user}
				<FullProfileCard {user} />
			{/if}
		</div>
	{/if}
</div>
