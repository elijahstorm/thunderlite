<script lang="ts">
	import { fly } from 'svelte/transition'
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'
	import FullProfileCard from '$lib/Components/Widgets/Social/FullProfileCard.svelte'
	import { browser } from '$app/environment'

	interface Props {
		auth?: string | null
		user?: UserDBData | null
		size?: number
		noClick?: boolean
		// When set, clicking the icon navigates to this route instead of opening the profile popup.
		href?: string | null
	}

	let {
		auth = null,
		user = $bindable(null),
		size = 2,
		noClick = false,
		href = null,
	}: Props = $props()

	let floatingProfile = $state<HTMLDivElement>()
	let shouldFlowLeft = $state(false)
	let shouldFlowUp = $state(false)
	let shouldFlowRight = $state(false)
	let reflow = $state(0)
	let open = $state(false)
	let style: string = $derived(`width: ${size}rem; height: ${size}rem;`)

	const openProfile = () => (open = !noClick && !!user?.username && !open)

	const fetchUserData = (userAuth: string) =>
		fetch(`/api/user/${userAuth}`)
			.then((res) => res.json())
			.then((data) => {
				if (data.user) {
					user = data.user
				}
			})

	$effect(() => {
		if (browser && typeof auth === 'string') {
			fetchUserData(auth)
		}
	})

	$effect(() => {
		reflow
		open
		if (!floatingProfile) return
		const profile = floatingProfile.getBoundingClientRect()
		const body = floatingProfile.ownerDocument?.body
		shouldFlowLeft = !!body && profile.x + 120 > body.clientWidth
		shouldFlowUp = !!body && profile.y + 400 > body.clientHeight
		shouldFlowRight = !shouldFlowLeft && profile.x - 120 < 0
	})
</script>

<svelte:window onresize={() => (reflow = performance.now())} />

<div class="relative">
	{#if href}
		<a class="contents" {href} aria-label="{user?.display_name ?? 'user'} profile">
			<div
				bind:this={floatingProfile}
				class="rounded-full overflow-hidden bg-surface-2 ring-1 ring-border hover:ring-border-strong transition-shadow cursor-pointer"
				{style}
			>
				<FallbackImage
					src={user?.profile_image_url}
					alt="{user?.display_name ?? 'user'} profile"
					cover
				/>
			</div>
		</a>
	{:else}
		<button class="contents" disabled={noClick} onclick={openProfile}>
			<div
				bind:this={floatingProfile}
				class="rounded-full overflow-hidden bg-surface-2 ring-1 ring-border hover:ring-border-strong transition-shadow"
				class:cursor-pointer={!noClick}
				class:cursor-default={noClick}
				{style}
			>
				<FallbackImage
					src={user?.profile_image_url}
					alt="{user?.display_name ?? 'user'} profile"
					cover
				/>
			</div>
		</button>
	{/if}

	<div
		class="fixed inset-0 h-screen w-screen z-50 bg-foreground/10 backdrop-blur-[2px]"
		class:hidden={!open}
		onkeydown={(e) => {
			e.stopPropagation()
			open = false
		}}
		onclick={(e) => {
			e.stopPropagation()
			open = false
		}}
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
