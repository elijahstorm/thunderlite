<script lang="ts">
	import { fly } from 'svelte/transition'
	import FallbackImage from '$lib/Components/Images/FallbackImage.svelte'
	import FullProfileCard from '$lib/Components/Widgets/Social/FullProfileCard.svelte'
	import { browser } from '$app/environment'

	export let auth: string | null = null
	export let user: UserDBData | null = null
	export let size: number = 2
	export let noClick = false

	const fallback = 'https://cdn4.iconfinder.com/data/icons/small-n-flat/24/user-alt-512.png'

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
			class="h-8 w-8 bg-white rounded-full border border-solid border-gray-600 overflow-hidden self-center cursor-pointer"
			class:cursor-default={noClick}
			{style}
		>
			<FallbackImage
				src={user?.profile_image_url}
				alt="{user?.display_name ?? 'user'} profile"
				{fallback}
				cover
			/>
		</div>
	</button>

	<div
		class="fixed inset-0 h-screen w-screen z-50 bg-[#ccc1] backdrop-blur-[2px]"
		class:hidden={!open}
		on:keydown|stopPropagation={() => (open = false)}
		on:click|stopPropagation={() => (open = false)}
		aria-label="Close profile popup modal"
		role="button"
		tabindex="0"
	/>

	{#if open}
		<div
			class="absolute left-1/2 -translate-x-1/2 pt-1 z-50 max-w-[13rem] w-52"
			class:bottom-10={shouldFlowUp}
			class:-translate-x-6={shouldFlowRight}
			class:-translate-x-40={shouldFlowLeft}
			in:fly={{ y: -20, duration: 200 }}
			out:fly={{ y: -20, duration: 200 }}
		>
			{#if user}
				<FullProfileCard {user} />
			{/if}
		</div>
	{/if}
</div>
